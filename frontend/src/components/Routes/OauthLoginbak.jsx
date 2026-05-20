import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SERVER_URL } from "../lib/constants";
import logo from "../../assets/cmxlogo-removebg-preview.png";
import UserService from "../../service/UserService";

const OauthLogin = () => {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);

  const isCallmaxEmail = (value) => {
    const trimmed = (value || "").trim().toLowerCase();
    const allowedDomains = ["callmaxsolutions.com"];
    return allowedDomains.some((d) => trimmed.endsWith(`@${d}`));
  };

  const handleManualOtpLogin = async () => {
    setError("");

    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    if (!isCallmaxEmail(email)) {
      setError("Please use your Callmax email address.");
      return;
    }

    setIsSending(true);

    try {
      // 1) Verify that the email exists in your USERS table
      const checkRes = await fetch(`${SERVER_URL}/api/check-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const checkData = await checkRes.json();

      if (!checkRes.ok || !checkData.success) {
        setError(checkData.error || "Invalid credentials");
        return;
      }

      const {
        empId,
        userid,
        userEmail,
        lastName,
        firstName,
        fullName,
        userLevel,
        userStatus,
      } = checkData.user || {};

      // Optional: Enforce only active users
      if (userStatus && userStatus.toLowerCase() !== "active") {
        setError(
          "This account is not active. Please contact your administrator.",
        );
        return;
      }

      // ✅ Save pendingUser for OTP step (existing user only)
      UserService.setPendingUser({
        empId,
        userid,
        userEmail,
        lastName,
        firstName,
        fullName,
        userLevel,
        userStatus,
      });

      // 2) Request OTP for this verified user
      const requestedDateTime = new Date();
      const expiryDateTime = new Date(requestedDateTime.getTime() + 3 * 60000); // +3 minutes

      const otpRes = await fetch(`${SERVER_URL}/sendOTP`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailAddress: email,
          requestedDateTime: requestedDateTime.toISOString(),
          expiryDateTime: expiryDateTime.toISOString(),
        }),
      });

      if (!otpRes.ok) {
        setError("Failed to send OTP. Please try again.");
        return;
      }

      const result = await otpRes.json();

      // Store OTP-related data for verification step
      localStorage.setItem("pendingOtpHashed", result.otpHashed);
      localStorage.setItem(
        "pendingRequestedAt",
        requestedDateTime.toISOString(),
      );
      localStorage.setItem("pendingExpiryAt", expiryDateTime.toISOString());
      localStorage.setItem("pendingEmail", email);

      // 3) Navigate to OTP verification screen
      navigate("/OTP-SECURE", {
        state: {
          emailAddress: email,
          requestedDateTime,
          expiryDateTime,
        },
      });
    } catch (err) {
      console.error("OTP login error:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#061326]">
      {/* Glow accent behind card */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="w-72 h-72 bg-[#00a1c9]/15 rounded-full blur-3xl absolute -top-16 -left-10" />
        <div className="w-72 h-72 bg-[#f58220]/10 rounded-full blur-3xl absolute bottom-0 right-0" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/95 border border-white/20 rounded-2xl shadow-2xl backdrop-blur-md px-8 py-9 md:px-9 md:py-10">
          {/* Logo + title */}
          <div className="flex flex-col items-center mb-6">
            <img
              src={logo}
              alt="Callmax Logo"
              className="w-40 md:w-44 mb-3 drop-shadow-sm"
            />
            <h2 className="text-lg md:text-xl font-semibold text-[#0c2545]">
              QA Portal - PH
            </h2>
            <p className="text-[11px] md:text-xs text-gray-500 mt-1">
              Secure access for Callmax team members.
            </p>
          </div>

          {/* Email + OTP */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Callmax Email
            </label>
            <div className="relative">
              <input
                type="email"
                placeholder="you@callmaxsolutions.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleManualOtpLogin();
                  }
                }}
                className="w-full border border-gray-200 rounded-lg pl-3 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#00a1c9] focus:border-transparent placeholder:text-gray-400"
              />
            </div>
          </div>

          <button
            onClick={handleManualOtpLogin}
            disabled={isSending}
            className={`w-full mt-3 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 transition
              ${
                isSending
                  ? "bg-[#7687a7] cursor-not-allowed"
                  : "bg-[#0084a4] hover:bg-[#015368]"
              }`}
          >
            {isSending ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Sending OTP…
              </>
            ) : (
              <>Send OTP to Email</>
            )}
          </button>

          {error && <p className="text-red-600 text-xs mt-4">{error}</p>}

          <p className="text-[11px] text-gray-800 mt-5 text-center">
            This is a passwordless login for existing Callmax users. Check your
            inbox for a one-time code to complete sign in.
          </p>
        </div>
        <div className="mt-3">
          <p className="text-[10px] text-white text-center">
            © 2025 CMX PH QA Portal v4.2.5
          </p>
          <p className="text-[10px]  text-white text-center">
            DREAM Dev Ops || Callmax Solutions International All Rights Reserved
          </p>
        </div>
      </div>
    </div>
  );
};

export default OauthLogin;
