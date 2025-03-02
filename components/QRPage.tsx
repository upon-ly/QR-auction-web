/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QRPage() {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    async function fetchQR() {
      const text = `${process.env.NEXT_PUBLIC_HOST_URL}/redirect`;
      const qrDataUrl = await QRCode.toDataURL(text, {
        // Optional: configure options like error correction level, margin, etc.
        errorCorrectionLevel: "H",
        margin: 1,
      });
      setQrDataUrl(qrDataUrl);
    }
    fetchQR();
  }, []);

  if (qrDataUrl !== "") {
    return <img src={qrDataUrl} alt="QR Code" className="md:flex-1" />;
  } else {
    return <p>Loading QR code...</p>;
  }
}
