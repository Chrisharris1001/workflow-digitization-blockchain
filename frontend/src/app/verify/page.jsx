'use client';
import { useState } from 'react';
import axios from 'axios';
import Link from 'next/link';

export default function VerifyPage() {
    const [docId, setDocId] = useState('');
    const [status, setStatus] = useState('AccountingApproved');
    const [file, setFile] = useState(null);
    const [result, setResult] = useState('');

    const handleVerify = async (e) => {
        e.preventDefault();

        if (!docId || !status || !file) {
            setResult('⚠️ All fields are required.');
            return;
        }

        const formData = new FormData();
        formData.append('docId', docId);
        formData.append('status', status);
        formData.append('document', file);

        try {
            const res = await axios.post('http://localhost:5000/api/documents/verify', formData);
            const { valid, partiallyApproved, message, blockchainStatus } = res.data;

            if (valid) {
                setResult(`✅ Document is fully valid. ${message}`);
            } else if (partiallyApproved) {
                setResult(`🟡 ${message}`);
            } else {
                setResult(`❌ Document is NOT valid. ${message}`);
            }
        } catch (err) {
            console.error(err);
            setResult(`❌ Error: ${err.response?.data?.error || err.message}`);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="w-full max-w-lg p-8 bg-white shadow-xl rounded-lg">
                <h1 className="text-3xl font-bold text-gray-800 mb-6">Verify Document</h1>
                <form onSubmit={handleVerify} className="space-y-4">
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
                        <option value="AccountingApproved">Accounting Approved</option>
                        <option value="LegalApproved">Legal Approved</option>
                        <option value="RectorApproved">Rector Approved</option>
                    </select>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Upload File to Verify</label>
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
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg"
                    >
                        Verify document
                    </button>
                </form>

                <Link href="/dashboard" className="mt-4 w-full inline-block text-center bg-amber-700 hover:bg-amber-800 text-white font-semibold py-2 px-4 rounded-lg">Go to dashboard</Link>
                {result && (
                    <div
                        className={`mt-4 text-sm px-4 py-2 rounded max-h-40 overflow-auto whitespace-pre-wrap break-words ${
                            result.startsWith('✅') ? 'bg-green-100 text-green-800'
                                : result.startsWith('🟡') ? 'bg-yellow-100 text-yellow-800'
                                    : result.startsWith('⚠️') ? 'bg-orange-100 text-orange-800'
                                        : 'bg-red-100 text-red-800'
                        }`}
                        style={{ fontFamily: 'monospace' }}
                    >
                        {result}
                    </div>
                )}
            </div>
        </div>
    );
}
