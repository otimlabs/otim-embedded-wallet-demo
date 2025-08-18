import { OtimClient } from "@otim/sdk";
import { parseUnits, toHex } from "viem";
import { startSpinner, stopSpinner } from './spinner';

// USDC contract address on Base Sepolia
const USDC_CONTRACT_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export async function performUSDCTransfers(
  otimClient: OtimClient, 
  walletClient: any, 
  publicClient: any, 
  fromAddress: string, 
  toAddress: string, 
  balance: number
) {
  const transferAmount = 0.5; // 0.5 USDC
  const maxTransfers = Math.floor(balance / transferAmount);
  
  if (maxTransfers < 1) {
    return;
  }

  let transferCount = 0;
  let spinnerText = `Preparing transfer ${transferCount + 1}/${maxTransfers}...`;
  startSpinner(() => spinnerText);
  
  while (transferCount < maxTransfers) {
    try {
      // Check current balance before each transfer
      const currentBalance = await publicClient.readContract({
        address: USDC_CONTRACT_ADDRESS as `0x${string}`,
        abi: [{
          name: "balanceOf",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        }],
        functionName: "balanceOf",
        args: [fromAddress as `0x${string}`],
      });
      
      const currentBalanceNumber = Number(currentBalance) / 1e6;
      
      if (currentBalanceNumber < transferAmount) {
        stopSpinner();
        break;
      }
      
      spinnerText = `Sending ${transferAmount} USDC (transfer ${transferCount + 1}/${maxTransfers})...`;
      
      // Get fee estimate
      const feeEstimate = await otimClient.config.getMaxPriorityFeeEstimate({
        chainId: walletClient.chain.id,
      });
      const priorityFee = toHex(feeEstimate.normalMaxPriorityFeeEstimate);
      
      // Build instruction and activate (ERC-20 transfer)
      const transferBuild = await otimClient.instruction.build.transfer({
        target: toAddress as `0x${string}`,
        value: parseUnits("0.5", 6), // 0.5 USDC with 6 decimals as BigInt
        token: USDC_CONTRACT_ADDRESS as `0x${string}`,
        schedule: {
          startAt: 0,
          startBy: 0,
          interval: 20, // 20 seconds
          timeout: 2,   // 2 seconds
        },
        fee: {
          token: USDC_CONTRACT_ADDRESS as `0x${string}`, // USDC for fees
          maxPriorityFeePerGas: priorityFee,
        },
      });

      // Activate the instruction
      const result = await transferBuild.activate({
        nickname: `USDC transfer ${transferAmount} to ${toAddress} (transfer ${transferCount + 1})`,
      });
      
      stopSpinner();
      console.log(`\nActivated: ${result.instructionId}`);
      
      transferCount++;
      
      if (transferCount < maxTransfers) {
        spinnerText = `Waiting 20 seconds before next transfer (${transferCount + 1}/${maxTransfers})...`;
        startSpinner(() => spinnerText);
        await new Promise((resolve) => setTimeout(resolve, 20000)); // Wait 20 seconds
      }
      
    } catch (error) {
      stopSpinner();
      console.log(`\nTransfer failed: ${(error as any).message}`);
      break;
    }
  }
  
  stopSpinner();
}
