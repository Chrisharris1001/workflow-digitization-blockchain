'use client';
import { useState } from 'react';
import axios from 'axios';
import { BrowserProvider, Contract } from 'ethers';
import Link from 'next/link';
import contractJSON from '../contract.json';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const CONTRACT_ADDRESS = '0xc4122C5209441A1a11140ebC8d1671E525662445';
const CONTRACT_ABI = contractJSON.abi;

export default function SignPage() {
    return (
        <Suspense>
            <SignPageContent />
        </Suspense>
    );
}

function SignPageContent() {
    const searchParams = useSearchParams();
    const initialDocId = searchParams.get('docId') || '';
    const initialStatus = searchParams.get('status') || '';
    const [docId, setDocId] = useState(initialDocId);
    const [status, setStatus] = useState(initialStatus);
    const [file, setFile] = useState(null);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    // Map status string to enum value for the contract
    const statusEnum = {
        AccountingApproved: 1,
        LegalApproved: 2,
        RectorApproved: 3
    };

    // Helper to get the previous department based on the current status
    const getPrecedingDepartment = (status) => {
        switch (status) {
            case 'AccountingApproved':
                return 'Submission';
            case 'LegalApproved':
                return 'Accounting Department';
            case 'RectorApproved':
                return 'Legal Department';
        }
    };

    // Handler for rejecting a document
    const handleReject = async (e) => {
        e.preventDefault();
        if (!docId) {
            setMessage('⚠️ Document ID is required to reject.');
            return;
        }
        const reason = window.prompt('Please provide a reason for rejection:');
        if (!reason) {
            setMessage('⚠️ Rejection reason is required.');
            return;
        }
        setLoading(true);
        setMessage('Rejecting document...');
        try {
            // Call backend to reject the document, passing the reason
            const res = await axios.post('http://localhost:5000/api/documents/reject', {
                docId,
                reason,
                department: status === 'AccountingApproved' ? 'Accounting' : status === 'LegalApproved' ? 'Legal' : status === 'RectorApproved' ? 'Rector' : ''
            });
            setMessage(`❌ Document rejected. Reason: ${reason}`);
            setDocId('');
            setStatus('AccountingApproved');
            setFile(null);
        } catch (err) {
            setMessage(`❌ Error rejecting document: ${err.response?.data?.error || err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!docId || !status || !file) {
            setMessage('⚠️ All fields are required.');
            return;
        }

        setLoading(true);
        setMessage('Validating document...');

        const formData = new FormData();
        formData.append('docId', docId);
        formData.append('status', status);
        formData.append('document', file);

        try {
            // Step 1: Validate and get hash from backend
            const res = await axios.post('http://localhost:5000/api/documents/sign', formData);
            const hash = res.data.hash;
            setMessage('Validation passed. Waiting for MetaMask signature...');

            // Step 2: Call smart contract via MetaMask
            if (!window.ethereum) {
                setMessage('❌ Please install MetaMask to sign documents.');
                setLoading(false);
                return;
            }
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
            const tx = await contract.signDocument(docId, statusEnum[status], hash);
            await tx.wait();

            // Get the signer address
            const signerAddress = await signer.getAddress();

            // Update backend after successful on-chain sign
            await axios.post('http://localhost:5000/api/documents/update-document', {
                docId,
                status,
                hash,
                txHash: tx.hash,
                author: signerAddress
            });

            setMessage(`✅ Document status signed on-chain! Tx: ${tx.hash}`);
            setDocId('');
            setStatus('AccountingApproved');
            setFile(null);
            // Redirect to dashboard to force refresh
            // window.location.href = '/dashboard';
        } catch (err) {
            console.error(err);
            // Custom error handling for MetaMask user rejection
            if (
                err.code === 4001 ||
                (err.error && err.error.code === 4001) ||
                (err.message && (
                    err.message.includes('user rejected action') ||
                    err.message.includes('User denied transaction signature')
                ))
            ) {
                setMessage(`You have canceled the process to sign a document from the ${getPrecedingDepartment(status)}, please try again!`);
            } else {
                setMessage(`❌ Error: ${err.response?.data?.error || err.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="w-full max-w-lg p-8 bg-white shadow-xl rounded-lg">
                <h1 className="text-3xl font-bold text-gray-800 mb-6">Sign Document Status</h1>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="text"
                        placeholder="Document ID"
                        value={docId}
                        onChange={(e) => setDocId(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg text-gray-900"
                        readOnly={!!initialDocId}
                    />
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg text-gray-900"
                        disabled={!!initialStatus && initialStatus !== ''}
                    >
                        <option value="">Select status</option>
                        <option value="AccountingApproved">Accounting Approved</option>
                        <option value="LegalApproved">Legal Approved</option>
                        <option value="RectorApproved">Rector Approved</option>
                    </select>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Upload Document to Sign</label>
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
                    <div className="flex gap-4">
                        <button
                            type="submit"
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg"
                            disabled={loading}
                        >
                            Sign
                        </button>
                        <button
                            type="button"
                            onClick={handleReject}
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg"
                            disabled={loading}
                        >
                            Reject
                        </button>
                    </div>
                </form>
                <Link href="/verify" className="mt-4 w-full inline-block text-center bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-semibold py-2 px-4 rounded-lg">Go to verify page</Link>
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
