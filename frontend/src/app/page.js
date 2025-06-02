import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-xl gap-8 bg-gray-100">
      <div className="bg-white rounded-lg shadow-lg p-8 flex flex-col items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Workflow Digitization Home</h1>
        <nav className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          <Link href="/submit" className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-base font-semibold text-center">Submit a document</Link>
          <Link href="/sign" className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-base font-semibold text-center">Sign a document</Link>
          <Link href="/verify" className="px-5 py-3 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl text-base font-semibold text-center">Verify a document</Link>
          <Link href="/dashboard" className="px-5 py-3 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-base font-semibold text-center">Dashboard</Link>
        </nav>
      </div>
    </main>
  );
}

