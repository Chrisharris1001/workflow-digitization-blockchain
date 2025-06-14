'use client'
import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';

const ETHERSCAN_BASE = 'https://sepolia.etherscan.io/tx/';

const departmentStatus = {
  Accounting: 'Submitted', // Accounting sees documents in 'Submitted' state
  Legal: 'AccountingApproved', // Legal sees documents in 'AccountingApproved' state
  Rector: 'LegalApproved', // Rector sees documents in 'LegalApproved' state
};

// Helper: Map status to department
const statusToDepartment = {
  AccountingApproved: 'Accounting',
  LegalApproved: 'Legal',
  RectorApproved: 'Rector',
};

// Helper: Get the next department after a given status
const getNextDepartment = (status) => {
  switch (status) {
    case 'AccountingApproved':
      return 'Legal';
    case 'LegalApproved':
      return 'Rector';
    case 'RectorApproved':
      return null; // No next department
    default:
      return null;
  }
};

export default function DashboardPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [department, setDepartment] = useState('Accounting');
  const [revertLoadingDocId, setRevertLoadingDocId] = useState(null);
  const [revertMessage, setRevertMessage] = useState('');

  const fetchDocuments = () => {
    setLoading(true);
    axios.get('http://localhost:5000/api/documents/dashboard')
        .then(res => setDocuments(res.data))
        .catch(() => setDocuments([]))
        .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const openHistory = (history) => {
    setSelectedHistory(history);
    setShowHistory(true);
  };

  const closeHistory = () => {
    setShowHistory(false);
    setSelectedHistory(null);
  };

  // Helper: Check if a document was approved by Accounting and then rejected by Legal
  const isRejectedAfterAccounting = (doc) => {
    if (!doc.history || doc.history.length < 2) return false;
    // Find last Accounting approval
    const accountingApproval = doc.history.find(h => h.status === 'AccountingApproved');
    // Find last rejection
    const lastRejection = doc.history.filter(h => h.status === 'Rejected').pop();
    // Find who rejected (Legal or Rector)
    if (accountingApproval && lastRejection) {
      // If rejection happened after accounting approval
      const accountingIdx = doc.history.findIndex(h => h === accountingApproval);
      const rejectionIdx = doc.history.findIndex(h => h === lastRejection);
      // Only if rejected after accounting approval and not by accounting
      if (rejectionIdx > accountingIdx && lastRejection.author !== accountingApproval.author) {
        // Optionally, check if rejection was by Legal
        return lastRejection;
      }
    }
    return false;
  };

  // Helper: Find the last approval before rejection
  const getLastApprovalBeforeRejection = (doc) => {
    if (!doc.history || doc.history.length < 2) return null;
    const lastRejectionIdx = [...doc.history].reverse().findIndex(h => h.status === 'Rejected');
    if (lastRejectionIdx === -1) return null;
    const rejectionIdx = doc.history.length - 1 - lastRejectionIdx;
    for (let i = rejectionIdx - 1; i >= 0; i--) {
      if (["AccountingApproved", "LegalApproved", "RectorApproved"].includes(doc.history[i].status)) {
        return doc.history[i];
      }
    }
    return null;
  };

  // Helper: Check if a document was reverted after rejection
  const isRevertedAfterRejection = (doc) => {
    if (!doc.history || doc.history.length < 2) return false;
    // Find the last rejection
    const lastRejectionIdx = [...doc.history].reverse().findIndex(h => h.status === 'Rejected');
    if (lastRejectionIdx === -1) return false;
    const rejectionIdx = doc.history.length - 1 - lastRejectionIdx;
    // Check if there is a revert after rejection
    for (let i = rejectionIdx + 1; i < doc.history.length; i++) {
      if (["AccountingApproved", "LegalApproved", "RectorApproved"].includes(doc.history[i].status)) {
        return doc.history[i].status;
      }
    }
    return false;
  };

  // Helper: Get the next status for signing based on current status
  const getNextStatus = (doc) => {
    switch (doc.status) {
      case 'Submitted':
        return 'AccountingApproved';
      case 'AccountingApproved':
        return 'LegalApproved';
      case 'LegalApproved':
        return 'RectorApproved';
      case 'Rejected': {
        // Find the last approval before rejection
        if (!doc.history || doc.history.length < 2) return '';
        const lastRejectionIdx = [...doc.history].reverse().findIndex(h => h.status === 'Rejected');
        if (lastRejectionIdx === -1) return '';
        const rejectionIdx = doc.history.length - 1 - lastRejectionIdx;
        // After revert, always go to the next status after the last approval before rejection
        for (let i = rejectionIdx - 1; i >= 0; i--) {
          if (["AccountingApproved", "LegalApproved", "RectorApproved"].includes(doc.history[i].status)) {
            // Return the next status in the flow
            if (doc.history[i].status === 'AccountingApproved') return 'LegalApproved';
            if (doc.history[i].status === 'LegalApproved') return 'RectorApproved';
            if (doc.history[i].status === 'RectorApproved') return '';
          }
        }
        return '';
      }
      default:
        return '';
    }
  };

  // Filter logic: show rejected docs to previous department and admin
  const filteredDocuments = department === 'Admin'
    ? documents
    : documents.filter(doc => {
        // Show if in the department's active status
        if (doc.status === departmentStatus[department]) return true;
        // Show RectorApproved docs in Rector dashboard
        if (department === 'Rector' && doc.status === 'RectorApproved') return true;
        // Show rejected docs to the department that last approved before rejection
        if (doc.status === 'Rejected') {
          const lastApproval = doc.history && doc.history.length > 1
            ? [...doc.history].reverse().find(h =>
                h.status === 'AccountingApproved' ||
                h.status === 'LegalApproved' ||
                h.status === 'RectorApproved')
            : null;
          // Only show in the department that last approved before rejection, and only if not reverted
          if (lastApproval && statusToDepartment[lastApproval.status] === department && !isRevertedAfterRejection(doc)) {
            return true;
          }
          return false;
        }
        // Show if reverted after rejection and the revert was to this department (and still in that reverted state)
        const revertedStatus = isRevertedAfterRejection(doc);
        if (revertedStatus && doc.status === revertedStatus) {
          const nextDept = getNextDepartment(revertedStatus);
          if (nextDept && department === nextDept) {
            return true;
          }
        }
        return false;
      });

  return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="w-full max-w-6xl bg-white shadow-xl rounded-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-800">Document Dashboard</h1>
            <div className="flex gap-2 items-center text-black">
              <label className="mr-2 font-bold">Department:</label>
              <select value={department} onChange={e => setDepartment(e.target.value)} className="border rounded px-2 py-1">
                <option value="Accounting">Accounting</option>
                <option value="Legal">Legal</option>
                <option value="Rector">Rector</option>
                <option value="Admin">Admin</option>
              </select>
              <button
                  onClick={fetchDocuments}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
                  disabled={loading}
              >
                Refresh
              </button>
              <a href="/"
                 className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium flex items-center">Home</a>
            </div>
          </div>
          {loading ? <p className="text-gray-600">Loading...</p> : (
              <div className="overflow-auto max-h-[60vh]">
                <table className="min-w-full border border-gray-200 rounded-lg table-fixed">
                  <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-700">ID</th>
                    <th className="px-4 py-2 text-left text-gray-700">Name</th>
                    <th className="px-4 py-2 text-left text-gray-700">Last Status</th>
                    <th className="px-4 py-2 text-left text-gray-700">Last Update</th>
                    <th className="px-4 py-2 text-left text-gray-700">Approval History</th>
                    <th className="px-4 py-2 text-left text-gray-700">Actions</th>
                  </tr>
                  </thead>
                  <tbody>
                  {filteredDocuments.map(doc => {
                    const lastHistory = doc.history ? doc.history[doc.history.length - 1] : null;
                    const rejectedInfo = department === 'Accounting' && doc.status === 'Rejected' ? isRejectedAfterAccounting(doc) : false;
                    return (
                        <tr key={doc._id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-900">{doc.docId}</td>
                          <td className="px-4 py-2 text-gray-900">{doc.name || '-'}</td>
                          <td className="px-4 py-2 text-gray-900">
                            {doc.status === 'Rejected' && doc.history && doc.history.length > 0 ? (
                              <span className="font-bold text-red-700">Rejected</span>
                            ) : (
                              doc.status
                            )}
                          </td>
                          <td className="px-4 py-2 text-gray-900">{lastHistory ? new Date(lastHistory.timestamp).toLocaleString() : '-'}</td>
                          <td className="px-4 py-2">
                            <button onClick={() => openHistory(doc.history || [])}
                                    className="px-3 py-1 bg-black hover:bg-gray-900 text-white rounded-lg text-sm font-medium">View
                            </button>
                          </td>
                          <td className="px-4 py-2 flex gap-2">
                            {/* Only show Sign if in the correct status for this department */}
                            {doc.status === departmentStatus[department] || (isRevertedAfterRejection(doc) && doc.status === departmentStatus[department]) ? (
                              <Link href={`http://localhost:3000/sign?docId=${encodeURIComponent(doc.docId)}&status=${getNextStatus(doc)}`}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
                                Sign
                              </Link>
                            ) : null}
                            <a
                              href={`http://localhost:5000/api/documents/download/${encodeURIComponent(doc.filename)}`}
                              className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium"
                              download
                            >
                              Download
                            </a>
                            {/* Only Admin can see the Delete button */}
                            {department === 'Admin' && (
                              <button
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
                                onClick={async () => {
                                  if (window.confirm('Are you sure you want to delete this document?')) {
                                    try {
                                      await axios.delete(`http://localhost:5000/api/documents/delete/${encodeURIComponent(doc.docId)}`);
                                      fetchDocuments();
                                    } catch (err) {
                                      alert('Failed to delete document: ' + (err.response?.data?.error || err.message));
                                    }
                                  }
                                }}
                              >
                                Delete
                              </button>
                            )}
                            {/* Show Revert button only if document is rejected (not submitted), this department last approved, and NOT if the document was already reverted after rejection */}
                            {doc.status === 'Rejected' && doc.status !== 'Submitted' && (() => {
                              const lastApproval = doc.history && doc.history.length > 1
                                ? [...doc.history].reverse().find(h =>
                                    h.status === 'AccountingApproved' ||
                                    h.status === 'LegalApproved' ||
                                    h.status === 'RectorApproved')
                                : null;
                              if (lastApproval && statusToDepartment[lastApproval.status] === department) {
                                // Prevent revert if the only approval before rejection is 'Submitted'
                                // i.e., if the document was submitted, then rejected, and never approved
                                const approvalsBeforeRejection = doc.history.filter(h =>
                                  ["AccountingApproved", "LegalApproved", "RectorApproved"].includes(h.status)
                                );
                                if (approvalsBeforeRejection.length === 0) {
                                  return false;
                                }
                                return true;
                              }
                              return false;
                            })() && (
                              <button
                                className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium"
                                onClick={async () => {
                                  setRevertLoadingDocId(doc.docId);
                                  setRevertMessage('Loading...reverting the file to the last department');
                                  try {
                                    await axios.post('http://localhost:5000/api/documents/revert', { docId: doc.docId });
                                    fetchDocuments();
                                    setRevertMessage('');
                                  } catch (err) {
                                    setRevertMessage('Failed to revert document: ' + (err.response?.data?.error || err.message));
                                  } finally {
                                    setRevertLoadingDocId(null);
                                  }
                                }}
                                disabled={revertLoadingDocId === doc.docId}
                              >
                                {revertLoadingDocId === doc.docId ? 'Reverting...' : 'Revert'}
                              </button>
                            )}
                          </td>
                        </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
          )}
        </div>
        {showHistory && (
            <div className="fixed inset-0 flex items-center justify-center bg-gray-200 bg-opacity-80 z-50">
              <div className="bg-white p-12 rounded-2xl shadow-2xl min-w-[320px] max-w-6xl w-full max-h-[95vh]">
                <h2 className="text-3xl font-semibold text-gray-800 mb-6">Approval History</h2>
                <div className="overflow-auto max-h-[85vh]">
                  <div className="overflow-x-auto max-w-full" style={{ minWidth: '350px' }}>
                    <table className="min-w-full border border-gray-200 rounded-lg">
                      <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-gray-700">Who (Address)</th>
                        <th className="px-4 py-3 text-left text-gray-700">Status</th>
                        <th className="px-4 py-3 text-left text-gray-700">When</th>
                        <th className="px-4 py-3 text-left text-gray-700">Tx Link</th>
                      </tr>
                      </thead>
                      <tbody>
                      {selectedHistory && selectedHistory.length > 0 ? selectedHistory.map((h, idx) => (
                        <tr key={idx} className="border-b border-gray-100 align-top">
                          <td className="px-4 py-3 text-gray-900 align-top">
                            {h.author && h.author.length > 12
                              ? `${h.author.slice(0, 7)}...${h.author.slice(-6)}`
                              : (h.author || '-')}
                          </td>
                          <td className="px-4 py-3 text-gray-900 break-all whitespace-normal min-w-[120px] max-w-[180px] align-top">{h.status}</td>
                          <td className="px-4 py-3 text-gray-900 break-all whitespace-normal min-w-[120px] max-w-[180px] align-top">{h.timestamp ? new Date(h.timestamp).toLocaleString() : '-'}</td>
                          <td className="px-4 py-3 text-gray-900 whitespace-nowrap align-top">
                            {h.txHash ? (
                              <a href={`${ETHERSCAN_BASE}${h.txHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                                {h.txHash.slice(0, 10)}...
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      )) : <tr>
                        <td colSpan={4} className="text-center py-3">No history</td>
                      </tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
                <button className="mt-6 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded w-full text-sm font-medium"
                        onClick={closeHistory}>Close
                </button>
              </div>
            </div>
        )}
        {revertMessage && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-yellow-100 text-yellow-900 px-6 py-3 rounded-lg shadow-lg z-50 text-center font-mono">
            {revertMessage}
          </div>
        )}
      </div>
  );
}