"use client";

import { useState } from "react";
import { Auth } from "@turnkey/sdk-react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  const onAuthSuccess = async () => {
    router.push("/dashboard");
  };

  const onError = (errorMessage: string) => {
    setErrorMessage(errorMessage);
  };

  const config = {
    authConfig: {
      emailEnabled: true,
      passkeyEnabled: false,
      phoneEnabled: false,
      appleEnabled: false,
      facebookEnabled: false,
      googleEnabled: false,
      walletEnabled: false,
    },
    configOrder: ["email"],
    onAuthSuccess,
    onError,
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Otim Embedded Wallet Demo Login
        </h1>
        <div className="flex justify-center">
          <Auth {...config} />
        </div>
        {errorMessage && (
          <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-center">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
