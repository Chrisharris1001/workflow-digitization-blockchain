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
    }

    mapping(string => Document) private documents;

    event DocumentSubmitted(string docId, address sender, bytes32 hash, uint256 timestamp);
    event DocumentRejected(string docId, address rejectedBy, uint256 timestamp);
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

        emit DocumentSubmitted(docId, msg.sender, hash, block.timestamp);
    }

    function signDocument(string memory docId, Status newStatus, bytes32 hash) external docExists(docId) {
        require(newStatus != Status.Rejected, "Use rejectDocument for rejection");
        Status currentStatus = documents[docId].status;

        if (newStatus == Status.AccountingApproved) {
            require(currentStatus == Status.Submitted, "Document must be submitted first");
        } else if (newStatus == Status.LegalApproved) {
            require(currentStatus == Status.AccountingApproved, "Accounting approval required first");
        } else if (newStatus == Status.RectorApproved) {
            require(currentStatus == Status.LegalApproved, "Legal approval required first");
        } else {
            revert("Invalid status update");
        }

        documents[docId].previousStatus = currentStatus;
        documents[docId].status = newStatus;
        documents[docId].approvers.push(msg.sender);
        documents[docId].hash = hash;
        documents[docId].timestamps[newStatus] = block.timestamp;

        emit DocumentSigned(docId, newStatus, msg.sender, hash, block.timestamp);
    }

    function rejectDocument(string memory docId) external docExists(docId) {
        require(documents[docId].status != Status.Rejected, "Document already rejected");
        documents[docId].previousStatus = documents[docId].status;
        documents[docId].status = Status.Rejected;
        documents[docId].approvers.push(msg.sender);
        documents[docId].timestamps[Status.Rejected] = block.timestamp;
        emit DocumentRejected(docId, msg.sender, block.timestamp);
    }

    function revertToPreviousStatus(string memory docId) external docExists(docId) {
        require(documents[docId].status == Status.Rejected, "Can only revert from Rejected status");
        require(
            documents[docId].previousStatus == Status.AccountingApproved ||
            documents[docId].previousStatus == Status.LegalApproved,
            "Can only revert to an approval status"
        );
        Status prev = documents[docId].previousStatus;
        documents[docId].status = prev;
        documents[docId].timestamps[prev] = block.timestamp;
        // Optionally, clear previousStatus or keep for audit
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

        if (uint8(documents[docId].status) < requestedStatus) {
            string memory currentStatusMsg;
            if (documents[docId].status == Status.AccountingApproved) {
                currentStatusMsg = "Document is currently approved by Accounting.";
            } else if (documents[docId].status == Status.LegalApproved) {
                currentStatusMsg = "Document is currently approved by Legal.";
            } else if (documents[docId].status == Status.Submitted) {
                currentStatusMsg = "Document is only submitted, not yet approved.";
            } else {
                currentStatusMsg = "Document is at a lower approval stage.";
            }
            return (false, true, currentStatusMsg);
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
}
