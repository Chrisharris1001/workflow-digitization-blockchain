// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

contract DocumentNotary {
    enum Status { Submitted, Signed1, Signed2, Signed3 }

    struct Document {
        string docId;
        address[] approvers;
        mapping(Status => bool) statusReached;
        mapping(Status => uint256) timestamps;
        mapping(Status => bytes32) docHashes;
        bool exists;
    }

    mapping(string => Document) private documents;

    event DocumentSubmitted(string docId, address sender, bytes32 hash, uint256 timestamp);
    event DocumentStatusUpdated(string docId, Status status, address approver, bytes32 hash, uint256 timestamp);

    modifier docExists(string memory docId) {
        require(documents[docId].exists, "Document does not exist");
        _;
    }

    function submitDocument(string memory docId, bytes32 hash) external {
        require(!documents[docId].exists, "Document already submitted");

        Document storage doc = documents[docId];
        doc.docId = docId;
        doc.statusReached[Status.Submitted] = true;
        doc.timestamps[Status.Submitted] = block.timestamp;
        doc.docHashes[Status.Submitted] = hash;
        doc.approvers.push(msg.sender);
        doc.exists = true;

        emit DocumentSubmitted(docId, msg.sender, hash, block.timestamp);
    }

    function updateStatus(string memory docId, Status status, bytes32 hash) external docExists(docId) {
        Document storage doc = documents[docId];

        // Prevent re-approving the same status
        require(!doc.statusReached[status], "Status already approved");

        doc.statusReached[status] = true;
        doc.timestamps[status] = block.timestamp;
        doc.docHashes[status] = hash;
        doc.approvers.push(msg.sender);

        emit DocumentStatusUpdated(docId, status, msg.sender, hash, block.timestamp);
    }

    function verifyDocument(string memory docId, Status status, bytes32 hash) external view docExists(docId) returns (bool) {
        Document storage doc = documents[docId];
        return doc.docHashes[status] == hash;
    }

    function getDocumentTimestamp(string memory docId, Status status) external view docExists(docId) returns (uint256) {
        return documents[docId].timestamps[status];
    }

    function getDocumentApprovers(string memory docId) external view docExists(docId) returns (address[] memory) {
        return documents[docId].approvers;
    }
}
