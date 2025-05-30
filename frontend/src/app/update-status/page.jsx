'use client';
import { useState } from 'react';
import axios from 'axios';
import Link from 'next/link';

export default function UpdateStatusPage() {
    const [docId, setDocId] = useState('');
    const [status, setStatus] = useState('DepartmentApproved');
    const [file, setFile] = useState(null);
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!docId || !status || !file) {
            setMessage('⚠️ All fields are required.');
            return;
        }

        const formData = new FormData();
        formData.append('docId', docId);
        formData.append('status', status);
        formData.append('document', file);

        try {
            const res = await axios.post('http://localhost:5000/api/documents/update-status', formData);
            setMessage(`✅ Status updated! Tx: ${res.data.txHash}`);
            setDocId('');
            setStatus('DepartmentApproved');
            setFile(null);
        } catch (err) {
            console.error(err);
            setMessage(`❌ Error: ${err.response?.data?.error || err.message}`);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="w-full max-w-lg p-8 bg-white shadow-xl rounded-lg">
                <h1 className="text-3xl font-bold text-gray-800 mb-6">Update Document Status</h1>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="text"
                        placeholder="Document ID"
                        value={docId}
                        onChange={(e) => setDocId(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg text-gray-900"
                    />
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg text-gray-900"
                    >
                        <option value="">Select status</option>
                        <option value="AccountingApproved">Accounting Approved</option>
                        <option value="LegalApproved">Legal Approved</option>
                        <option value="RectorApproved">Rector Approved</option>
                    </select>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Upload Updated Document</label>
                        <div className="flex items-center">
                            <label className="cursor-pointer inline-flex items-center px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-medium">
                                Choose File
                                <input
                                    type="file"
                                    onChange={(e) => setFile(e.target.files[0])}
                                    className="hidden"
                                />
                            </label>
                            <span className="ml-3 text-sm text-gray-600 truncate max-w-[200px]">
                {file ? file.name : 'No file selected'}
              </span>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg"
                    >
                        Update Status
                    </button>
                </form>
                <Link href="/verify" className="mt-4 w-full inline-block text-center bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg">Go to Verify Page</Link>
                {message && (
                    <div
                        className={`mt-4 text-sm px-4 py-2 rounded max-h-40 overflow-auto whitespace-pre-wrap break-words ${
                            message.startsWith('✅')
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                        }`}
                        style={{ fontFamily: 'monospace' }}
                    >
                        {message}
                    </div>
                )}
            </div>
        </div>
    );
}
