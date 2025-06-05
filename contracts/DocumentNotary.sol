// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

contract DocumentNotary {
    enum Status { Submitted, AccountingApproved, LegalApproved, RectorApproved, Rejected }

    struct Document {
        string docId;
        bytes32 hash;
        Status status;
        Status previousStatus;
        address[] approvers;
        mapping(Status => uint256) timestamps;
        Status[] statusHistory; // Track all status changes
    }

    mapping(string => Document) private documents;

    event DocumentSubmitted(string docId, address sender, bytes32 hash, uint256 timestamp);
    event DocumentRejected(string docId, address rejectedBy, bytes32 hash, uint256 timestamp);
    event DocumentSigned(string docId, Status status, address signer, bytes32 hash, uint256 timestamp);

    modifier docExists(string memory docId) {
       require(documents[docId].timestamps[Status.Submitted] != 0, "Document does not exist");
       _;
    }

    function submitDocument(string memory docId, bytes32 hash) external {
        require(documents[docId].timestamps[Status.Submitted] == 0, "Document already submitted");

        documents[docId].docId = docId;
        documents[docId].hash = hash;
        documents[docId].status = Status.Submitted;
        documents[docId].approvers = new address[](0);
        documents[docId].timestamps[Status.Submitted] = block.timestamp;
        documents[docId].statusHistory.push(Status.Submitted); // Add to history

        emit DocumentSubmitted(docId, msg.sender, hash, block.timestamp);
    }

    function getLastNonRejectedStatus(string memory docId) internal view returns (Status) {
        Status[] storage history = documents[docId].statusHistory;
        for (uint i = history.length; i > 0; i--) {
            if (history[i-1] != Status.Rejected) {
                return history[i-1];
            }
        }
        return Status.Submitted;
    }

    function signDocument(string memory docId, Status newStatus, bytes32 hash) external docExists(docId) {
        require(newStatus != Status.Rejected, "Use rejectDocument for rejection");
        Status currentStatus = documents[docId].status;

        // Allow normal forward flow or signing after revert
        if (newStatus == Status.AccountingApproved) {
            require(currentStatus == Status.Submitted, "Document must be submitted first");
        } else if (newStatus == Status.LegalApproved) {
            Status lastNonRejected = getLastNonRejectedStatus(docId);
            require(
                currentStatus == Status.AccountingApproved ||
                lastNonRejected == Status.AccountingApproved,
                "Accounting approval required first or reverted to AccountingApproved"
            );
        } else if (newStatus == Status.RectorApproved) {
            Status lastNonRejected = getLastNonRejectedStatus(docId);
            require(
                currentStatus == Status.LegalApproved ||
                lastNonRejected == Status.LegalApproved,
                "Legal approval required first or reverted to LegalApproved"
            );
        } else {
            revert("Invalid status update");
        }

        documents[docId].previousStatus = currentStatus;
        documents[docId].status = newStatus;
        documents[docId].approvers.push(msg.sender);
        documents[docId].hash = hash;
        documents[docId].timestamps[newStatus] = block.timestamp;
        documents[docId].statusHistory.push(newStatus);

        emit DocumentSigned(docId, newStatus, msg.sender, hash, block.timestamp);
    }

    function rejectDocument(string memory docId, bytes32 hash) external docExists(docId) {
        require(
            documents[docId].status == Status.Submitted ||
            documents[docId].status == Status.AccountingApproved ||
            documents[docId].status == Status.LegalApproved ||
            documents[docId].status == Status.RectorApproved,
            "Can only reject from a valid approval or submitted status"
        );
        require(
            documents[docId].status != Status.Rejected,
            "Document already rejected"
        );
        documents[docId].previousStatus = documents[docId].status;
        documents[docId].status = Status.Rejected;
        documents[docId].hash = hash;
        documents[docId].timestamps[Status.Rejected] = block.timestamp;
        documents[docId].statusHistory.push(Status.Rejected);
        documents[docId].approvers.push(msg.sender);
        emit DocumentRejected(docId, msg.sender, hash, block.timestamp);
    }

    function revertToPreviousStatus(string memory docId) external docExists(docId) {
        require(
            documents[docId].status == Status.Rejected,
            "Can only revert from Rejected status"
        );
        uint len = documents[docId].statusHistory.length;
        require(len >= 2, "Not enough history to revert");

        // Find the last approval status before the most recent rejection
        int lastApprovalIdx = -1;
        for (int i = int(len) - 2; i >= 0; i--) {
            Status s = documents[docId].statusHistory[uint(i)];
            if (
                s == Status.AccountingApproved ||
                s == Status.LegalApproved ||
                s == Status.RectorApproved
            ) {
                lastApprovalIdx = i;
                break;
            }
        }
        require(lastApprovalIdx >= 0, "No previous approval status to revert to");
        Status revertTo = documents[docId].statusHistory[uint(lastApprovalIdx)];
        documents[docId].status = revertTo;
        documents[docId].timestamps[revertTo] = block.timestamp;
        documents[docId].statusHistory.push(revertTo);
    }

    function verifyDocument(string memory docId, uint8 requestedStatus, bytes32 submittedHash) public view returns (bool isValid, bool isPartial, string memory message)
    {
        if (documents[docId].timestamps[Status.Submitted] == 0) {
            return (false, false, "Document not found");
        }

        if (documents[docId].hash != submittedHash) {
            return (false, false, "Hash mismatch");
        }

        if (documents[docId].status == Status.Rejected) {
            return (false, false, "Document was rejected");
        }

        if (uint8(documents[docId].status) == requestedStatus) {
            return (true, false, "Fully approved for requested status");
        }

        // If the document is at a higher status than requested, it should still be considered valid
        if (uint8(documents[docId].status) > requestedStatus && documents[docId].status != Status.Rejected) {
            return (true, false, "Document has been approved for a higher status.");
        }

        // Allow signing again after revert: if the document is at a lower status than requested, allow partial approval
        if (uint8(documents[docId].status) < requestedStatus) {
            string memory currentStatusMsg;
            if (documents[docId].status == Status.AccountingApproved) {
                currentStatusMsg = "Document is currently approved by Accounting. You may sign for the next approval.";
                return (false, true, currentStatusMsg);
            } else if (documents[docId].status == Status.LegalApproved) {
                currentStatusMsg = "Document is currently approved by Legal. You may sign for the next approval.";
                return (false, true, currentStatusMsg);
            } else if (documents[docId].status == Status.Submitted) {
                currentStatusMsg = "Document is only submitted, not yet approved.";
                return (false, true, currentStatusMsg);
            } else {
                currentStatusMsg = "Document is at a lower approval stage.";
                return (false, true, currentStatusMsg);
            }
        }

        return (false, false, "Document not valid for requested status");
    }

    function getDocumentTimestamp(string memory docId, Status status) external view docExists(docId) returns (uint256) {
        return documents[docId].timestamps[status];
    }

    function getDocumentStatus(string memory docId) external view docExists(docId) returns (Status) {
        return documents[docId].status;
    }

    function getDocumentApprovers(string memory docId) external view docExists(docId) returns (address[] memory) {
        return documents[docId].approvers;
    }

    function getStatusHistory(string memory docId) external view docExists(docId) returns (Status[] memory) {
        return documents[docId].statusHistory;
    }

    function getDocument(string memory docId) public view returns (
        string memory,
        bytes32,
        Status,
        Status,
        address[] memory
    ) {
        require(documents[docId].timestamps[Status.Submitted] != 0, "Document does not exist");
        Document storage doc = documents[docId];
        return (
            doc.docId,
            doc.hash,
            doc.status,
            doc.previousStatus,
            doc.approvers
        );
    }
}