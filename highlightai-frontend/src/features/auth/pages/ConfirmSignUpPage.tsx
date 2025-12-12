import { useState } from "react";
import { confirmSignupApi } from "../api/authApi";
import { useSearchParams, useNavigate } from "react-router-dom";

export default function ConfirmSignUpPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const email = search.get("email") || "";
  const [code, setCode] = useState("");

  async function handleConfirm() {
    try {
      await confirmSignupApi({ email, code });
      alert("Account verified! Please sign in.");
      navigate("/signin");
    } catch (err) {
      alert("Verification failed");
    }
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-xl font-semibold">Confirm Your Email</h1>
      <p>A 6-digit code was sent to: {email}</p>

      <input
        className="border p-2 w-full mt-4"
        placeholder="Enter code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />

      <button
        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
        onClick={handleConfirm}
      >
        Confirm
      </button>
    </div>
  );
}
