'use client'
import { useState, useEffect } from 'react';
import axios from 'axios';

// const ETHERSCAN_BASE = 'https://sepolia.etherscan.io/address/0x88b906418CafddC77E0232e479ECA1669BC67BfB';
const ETHERSCAN_BASE = 'https://sepolia.etherscan.io/tx/';

export default function DashboardPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  // Refactor fetching logic into a function
  const fetchDocuments = () => {
    setLoading(true);
    axios.get('http://localhost:3000/api/documents/dashboard')
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

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-100 py-10">
      <div className="w-full max-w-6xl bg-white shadow-xl rounded-lg p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Document Dashboard</h1>
          {/* Add a manual refresh button */}
          <button
            onClick={fetchDocuments}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            disabled={loading}
          >
            Refresh
          </button>
        </div>
        {loading ? <p className="text-gray-600">Loading...</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200 rounded-lg">
              <thead className="bg-gray-200">
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
                  const lastHistory = doc.history && doc.history.length > 0 ? doc.history[doc.history.length - 1] : null;
                  return (
                    <tr key={doc._id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2">{doc.name || doc.docId}</td>
                      <td className="px-4 py-2">{doc.version}</td>
                      <td className="px-4 py-2">{doc.currentStatus || doc.status}</td>
                      <td className="px-4 py-2">{lastHistory ? new Date(lastHistory.timestamp).toLocaleString() : '-'}</td>
                      <td className="px-4 py-2">
                        {lastHistory && lastHistory.txHash ? (
                          <a href={`${ETHERSCAN_BASE}${lastHistory.txHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                            {lastHistory.txHash.slice(0, 10)}...
                          </a>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={() => openHistory(doc.history || [])} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition">View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approval History Modal */}
      {showHistory && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl min-w-[350px] max-w-lg w-full">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Approval History</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200 rounded-lg">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-700">Who (Address)</th>
                    <th className="px-3 py-2 text-left text-gray-700">Status</th>
                    <th className="px-3 py-2 text-left text-gray-700">When</th>
                    <th className="px-3 py-2 text-left text-gray-700">Tx Link</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedHistory && selectedHistory.length > 0 ? selectedHistory.map((h, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="px-3 py-2">{h.author || '-'}</td>
                      <td className="px-3 py-2">{h.status}</td>
                      <td className="px-3 py-2">{h.timestamp ? new Date(h.timestamp).toLocaleString() : '-'}</td>
                      <td className="px-3 py-2">{h.txHash ? (
                        <a href={`${ETHERSCAN_BASE}${h.txHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                          {h.txHash.slice(0, 10)}...
                        </a>
                      ) : '-'}</td>
                    </tr>
                  )) : <tr><td colSpan={4} className="text-center py-2">No history</td></tr>}
                </tbody>
              </table>
            </div>
            <button className="mt-6 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-900 transition w-full" onClick={closeHistory}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
