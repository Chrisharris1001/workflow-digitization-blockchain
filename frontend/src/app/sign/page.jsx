'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { BrowserProvider, Contract } from 'ethers';
import Link from 'next/link';
import contractJSON from '../contract.json';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const CONTRACT_ADDRESS = '0x1be7b9Ba6994Cad1497c8D21c3b02424DE901Cd4';
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
    const [fileInputKey, setFileInputKey] = useState(Date.now()); // Add key for file input reset
    const [availableStatuses, setAvailableStatuses] = useState([
        { value: 'AccountingApproved', label: 'Accounting Approved' },
        { value: 'LegalApproved', label: 'Legal Approved' },
        { value: 'RectorApproved', label: 'Rector Approved' },
    ]);

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

    // Fetch current on-chain status and set available statuses accordingly
    const fetchAvailableStatuses = async (docId) => {
        if (!docId) return;
        try {
            if (!window.ethereum) return;
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
            const currentStatus = await contract.getDocumentStatus(docId);
            // 0: Submitted, 1: AccountingApproved, 2: LegalApproved, 3: RectorApproved, 4: Rejected
            let nextStatus = null;
            if (Number(currentStatus) === 0) nextStatus = 'AccountingApproved';
            else if (Number(currentStatus) === 1) nextStatus = 'LegalApproved';
            else if (Number(currentStatus) === 2) nextStatus = 'RectorApproved';
            else nextStatus = null;
            if (nextStatus) {
                setAvailableStatuses([
                    { value: nextStatus, label: nextStatus.replace('Approved', ' Approved').replace('Rector', 'Rector') }
                ]);
                setStatus(nextStatus);
            } else {
                setAvailableStatuses([]);
                setStatus('');
            }
        } catch (err) {
            // fallback: show all
            setAvailableStatuses([
                { value: 'AccountingApproved', label: 'Accounting Approved' },
                { value: 'LegalApproved', label: 'Legal Approved' },
                { value: 'RectorApproved', label: 'Rector Approved' },
            ]);
        }
    };

    // Update available statuses when docId changes
    useEffect(() => {
        fetchAvailableStatuses(docId);
    }, [docId]);

    // Handler for rejecting a document
    const handleReject = async (e) => {
        e.preventDefault();
        if (!docId || !file) {
            setMessage('⚠️ Document ID and file are required to reject.');
            return;
        }
        setLoading(true);
        setMessage('Validating document for rejection...');
        try {
            // Step 1: Validate and get hash from backend (send current status for hash validation)
            // Fetch the current status from the contract first
            if (!window.ethereum) {
                setMessage('❌ Please install MetaMask to reject documents.');
                setLoading(false);
                return;
            }
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const currentStatus = await contract.getDocumentStatus(docId);
            // Log and show the current status to the user
            const statusNumToString = {
                0: 'Submitted',
                1: 'AccountingApproved',
                2: 'LegalApproved',
                3: 'RectorApproved',
                4: 'Rejected'
            };
            const backendStatus = statusNumToString[Number(currentStatus)];
            // Debug log for docId and on-chain status
            console.log(`[REJECT DEBUG] Frontend - docId: ${docId}, onChainStatus: ${currentStatus} (${backendStatus})`);
            if (!backendStatus || Number(currentStatus) > 3) {
                setMessage(`❌ Cannot reject: Current status is '${backendStatus}' (${currentStatus}). Only Submitted, AccountingApproved, LegalApproved, or RectorApproved can be rejected.`);
                setLoading(false);
                return;
            }
            // Prevent rejection if already rejected
            if (Number(currentStatus) === 4) {
                setMessage('❌ This document is already rejected on-chain. You cannot reject it again.');
                setLoading(false);
                return;
            }

            // Get hash from backend using the current status
            const formData = new FormData();
            formData.append('docId', docId);
            formData.append('status', backendStatus);
            formData.append('document', file);
            const res = await axios.post('http://localhost:5000/api/documents/sign', formData);
            const hash = res.data.hash;

            // Step 2: Check if document exists and hash matches on-chain (same as sign logic)
            const verifyResult = await contract.verifyDocument(docId, Number(currentStatus), hash);
            if (!verifyResult[0] && verifyResult[2] === 'Document not found') {
                setMessage('❌ Cannot reject: Document was not submitted.');
                setLoading(false);
                return;
            }
            if (!verifyResult[0] && verifyResult[2] === 'Hash mismatch') {
                setMessage('❌ Cannot reject: Hash mismatch with submitted document.');
                setLoading(false);
                return;
            }

            // Map contract status to department for backend
            const statusToDepartment = {
                0: 'Accounting', // Submitted
                1: 'Legal',      // AccountingApproved
                2: 'Rector',     // LegalApproved
                3: 'Rector',     // RectorApproved (now allows rejection by Rector)
                4: ''            // Rejected
            };
            const department = statusToDepartment[Number(currentStatus)];
            if (!department) {
                setMessage('❌ Cannot reject: Invalid department for current status.');
                setLoading(false);
                return;
            }

            // Step 3: Call smart contract to reject the document (MetaMask interaction)
            let tx;
            try {
                tx = await contract.rejectDocument(docId, hash);
                setMessage('⏳ Waiting for transaction confirmation...');
                await tx.wait();
            } catch (err) {
                setMessage(`❌ MetaMask transaction failed: ${err.message}`);
                setLoading(false);
                return;
            }

            // Step 3.5: Re-fetch on-chain status after rejection (for info only)
            const statusAfter = await contract.getDocumentStatus(docId);
            // Always call backend to update DB, regardless of statusAfter

            // Step 4: Call backend to reject the document
            await axios.post('http://localhost:5000/api/documents/reject', {
                docId,
                hash,
                department
            });
            setMessage(`❌ Document rejected and recorded on blockchain!`);
            setDocId('');
            setStatus('AccountingApproved');
            setFile(null);
            setFileInputKey(Date.now()); // Reset file input after success
        } catch (err) {
            setMessage(`❌ Error rejecting document: ${err.response?.data?.error || err.message}`);
            setFile(null); // Reset file after error
            setFileInputKey(Date.now()); // Reset file input after error
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

            // Step 2: Check if document exists and hash matches on-chain
            setMessage('Verifying document existence and hash on-chain...');
            if (!window.ethereum) {
                setMessage('❌ Please install MetaMask to sign documents.');
                setLoading(false);
                return;
            }
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            // Get the on-chain document using getDocument
            let docOnChain;
            try {
                docOnChain = await contract.getDocument(docId);
                console.log('[SIGN DEBUG] docId:', docId, 'onChainHash:', docOnChain[1], 'localHash:', hash);
            } catch (err) {
                setMessage('❌ Cannot sign: Document not found on-chain.');
                setLoading(false);
                return;
            }
            const onChainHash = docOnChain[1];
            if (!onChainHash || onChainHash === '0x' || onChainHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
                setMessage('❌ Cannot sign: Document not found on-chain.');
                setLoading(false);
                return;
            }
            if (onChainHash !== hash) {
                setMessage('❌ Cannot sign: Hash mismatch. The uploaded file does not match the submitted document.');
                setLoading(false);
                return;
            }

            // Call verifyDocument on-chain
            const verifyResult = await contract.verifyDocument(docId, statusEnum[status], hash);
            // verifyResult is a tuple: [isValid, isPartial, message]
            // Allow signing if document is only submitted and user is trying to sign for AccountingApproved
            if (!verifyResult[0]) {
                if (
                    (verifyResult[1] && (
                        verifyResult[2].includes('You may sign for the next approval.') ||
                        verifyResult[2].includes('not yet approved.')
                    ))
                ) {
                    // Allow signing for next approval or first approval after revert
                } else {
                    setMessage(`❌ Cannot sign: ${verifyResult[2]}`);
                    setLoading(false);
                    return;
                }
            }

            setMessage('Validation passed. Waiting for MetaMask signature...');

            // Step 3: Call smart contract via MetaMask
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
            setFileInputKey(Date.now()); // Reset file input after success
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
            setFile(null); // Reset file after error
            setFileInputKey(Date.now()); // Reset file input after error
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
                        disabled={availableStatuses.length === 0 || !!initialStatus && initialStatus !== ''}
                    >
                        <option value="">Select status</option>
                        {availableStatuses.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </select>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Upload Document to Sign</label>
                        <div className="flex items-center">
                            <label className="cursor-pointer inline-flex items-center px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-medium">
                                Choose File
                                <input
                                    key={fileInputKey} // Add key to force re-render
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