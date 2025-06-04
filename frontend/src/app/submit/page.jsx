'use client';
import { useState } from 'react';
import axios from 'axios';
import Link from "next/link";

export default function SubmitPage() {
    const [docId, setDocId] = useState('');
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!docId || !file) {
            setStatus('⚠️ All fields are required.');
            return;
        }

        const formData = new FormData();
        formData.append('docId', docId);
        formData.append('document', file);

        try {
            const res = await axios.post('http://localhost:5000/api/documents/submit-doc', formData);
            setStatus(`✅ Success! Tx: ${res.data.txHash}`);
            setDocId('');
            setFile(null);
        } catch (err) {
            console.error(err);
            setStatus(`❌ Error: ${err.response?.data?.error || err.message}`);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="w-full max-w-lg p-8 bg-white shadow-xl rounded-lg">
                <h1 className="text-3xl font-bold text-gray-800 mb-6">Submit Document</h1>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="text"
                        placeholder="Document ID (e.g., TRIP-001)"
                        value={docId}
                        onChange={(e) => setDocId(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400"
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Upload Document</label>
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
                              {file ? file.name : "No file selected"}
                            </span>
                        </div>
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg"
                    >
                        Submit
                    </button>
                </form>
                <Link href="/sign" className="mt-4 w-full inline-block text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg">Go to sign page</Link>
                {status && (
                    <div
                        className={`mt-4 text-sm px-4 py-2 rounded relative max-h-40 overflow-auto whitespace-pre-wrap break-words ${
                            status.startsWith("✅")
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                        }`}
                        style={{ fontFamily: 'monospace' }}
                    >
                        {status}
                    </div>
                )}
            </div>
        </div>
    );

}
