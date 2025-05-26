import { getNeynarClient } from "@/lib/neynar";
import { ViemLocalEip712Signer } from "@farcaster/hub-nodejs";
import { bytesToHex, hexToBytes } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { getFid } from "./getFid";

export const getSignedKey = async (is_sponsored: boolean = true) => {
  const neynarClient = getNeynarClient();
  const createSigner = await neynarClient.createSigner();
  const { deadline, signature, sponsor } = await generate_signature(
    createSigner.public_key,
    is_sponsored
  );

  if (deadline === 0 || signature === "") {
    throw new Error("Failed to generate signature");
  }

  const fid = await getFid();

  const options = sponsor ? { sponsor } : undefined;

  const signedKey = await neynarClient.registerSignedKey({
    signerUuid: createSigner.signer_uuid,
    appFid: fid,
    deadline,
    signature,
    ...options
  });

  return signedKey;
};

const generate_signature = async function (
  public_key: string,
  is_sponsored = true
) {
  if (typeof process.env.FARCASTER_DEVELOPER_MNEMONIC === "undefined") {
    throw new Error("FARCASTER_DEVELOPER_MNEMONIC is not defined");
  }

  const FARCASTER_DEVELOPER_MNEMONIC = process.env.FARCASTER_DEVELOPER_MNEMONIC;
  const FID = await getFid();

  const account = mnemonicToAccount(FARCASTER_DEVELOPER_MNEMONIC);
  const appAccountKey = new ViemLocalEip712Signer(account);

  // Generates an expiration date for the signature (24 hours from now).
  const deadline = Math.floor(Date.now() / 1000) + 86400;

  const uintAddress = hexToBytes(public_key as `0x${string}`);

  const signature = await appAccountKey.signKeyRequest({
    requestFid: BigInt(FID),
    key: uintAddress,
    deadline: BigInt(deadline),
  });

  if (signature.isErr()) {
    return {
      deadline,
      signature: "",
    };
  }

  const sigHex = bytesToHex(signature.value);

  let sponsor;

  if (is_sponsored) {
    sponsor = {
      sponsored_by_neynar: true
    };
  }

  return { deadline, signature: sigHex, sponsor };
}; 