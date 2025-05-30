'use client'
import { useState, useEffect } from 'react';
import axios from 'axios';

const ETHERSCAN_BASE = 'https://sepolia.etherscan.io/tx/';

export default function DashboardPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [verifyResults, setVerifyResults] = useState([]);

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

  const handleFileChange = (docId, file) => {
    setSelectedFiles((prev) => ({...prev, [docId]: file}));
  };

  const verifyDoc = async (doc) => {
    const formData = new FormData();
    formData.append('document', selectedFiles[doc.docId]);
    formData.append('docId', doc.docId);
    formData.append('status', doc.status);

    try {
      const res = await axios.post('http://localhost:3000/api/documents/verify', formData);
      setVerifyResults((prev) => ({...prev, [doc.docId]: res.data}));
    } catch (err) {
      setVerifyResults((prev) => ({
        ...prev,
        [doc.docId]: {error: err?.response?.data?.error || "Verification failed!"}
      }));
    }
  };

  return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="w-full max-w-6xl bg-white shadow-xl rounded-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-800">Document Dashboard</h1>
            <div className="flex gap-2">
              <button
                  onClick={fetchDocuments}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
                  disabled={loading}
              >
                Refresh
              </button>
              <a href="/"
                 className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center">Home</a>
            </div>
          </div>
          {loading ? <p className="text-gray-600">Loading...</p> : (
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 rounded-lg">
                  <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-700">Name</th>
                    <th className="px-4 py-2 text-left text-gray-700">Version</th>
                    <th className="px-4 py-2 text-left text-gray-700">Status</th>
                    <th className="px-4 py-2 text-left text-gray-700">Last Update</th>
                    <th className="px-4 py-2 text-left text-gray-700">Tx Hash</th>
                    <th className="px-4 py-2 text-left text-gray-700">Approval History</th>
                  </tr>
                  </thead>
                  <tbody>
                  {documents.map(doc => {
                    const lastHistory = doc.history ? doc.history[doc.history.length - 1] : null;
                    return (
                        <tr key={doc._id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-900">{doc.name || doc.docId}</td>
                          <td className="px-4 py-2 text-gray-900">{doc.version}</td>
                          <td className="px-4 py-2 text-gray-900">{doc.currentStatus || doc.status}</td>
                          <td className="px-4 py-2 text-gray-900">{lastHistory ? new Date(lastHistory.timestamp).toLocaleString() : '-'}</td>
                          <td className="px-4 py-2">
                            {lastHistory && lastHistory.txHash ? (
                                <a href={`${ETHERSCAN_BASE}${lastHistory.txHash}`} target="_blank"
                                   rel="noopener noreferrer" className="text-blue-600 underline">
                                  {lastHistory.txHash.slice(0, 10)}...
                                </a>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-2">
                            <button onClick={() => openHistory(doc.history || [])}
                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">View
                            </button>
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
              <div className="bg-white p-12 rounded-2xl shadow-2xl min-w-[600px] max-w-2xl w-full">
                <h2 className="text-3xl font-semibold text-gray-800 mb-6">Approval History</h2>
                <div className="overflow-x-auto">
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
                        <tr key={idx} className="border-b border-gray-100">
                          <td className="px-4 py-3 text-gray-900">{h.author || '-'}</td>
                          <td className="px-4 py-3 text-gray-900">{h.status}</td>
                          <td className="px-4 py-3 text-gray-900">{h.timestamp ? new Date(h.timestamp).toLocaleString() : '-'}</td>
                          <td className="px-4 py-3">{h.txHash ? (
                              <a href={`${ETHERSCAN_BASE}${h.txHash}`} target="_blank" rel="noopener noreferrer"
                                 className="text-blue-600 underline">
                                {h.txHash.slice(0, 10)}...
                              </a>
                          ) : '-'}</td>
                        </tr>
                    )) : <tr>
                      <td colSpan={4} className="text-center py-3">No history</td>
                    </tr>}
                    </tbody>
                  </table>
                </div>
                <button className="mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg w-full"
                        onClick={closeHistory}>Close
                </button>
              </div>
            </div>
        )}
      </div>
  );
}
