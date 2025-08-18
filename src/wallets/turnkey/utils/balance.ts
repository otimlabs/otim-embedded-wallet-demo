import { startSpinner, stopSpinner } from './spinner';

// USDC contract address on Base Sepolia
const USDC_CONTRACT_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export async function checkUSDCBalance(publicClient: any, walletAddress: `0x${string}`) {
  let attempts = 0;
  const maxAttempts = 60; // 10 minutes max (60 * 10 seconds)
  let lastBalanceUSDC = 0;
  let lastMessage = `Checking USDC balance... ${lastBalanceUSDC} USDC (attempt ${attempts + 1}/${maxAttempts})`;

  startSpinner(() => lastMessage);
  
  while (attempts < maxAttempts) {
    const displayAttempt = attempts + 1;

    try {
      const balance = await publicClient.readContract({
        address: USDC_CONTRACT_ADDRESS as `0x${string}`,
        abi: [{
          name: "balanceOf",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        }],
        functionName: "balanceOf",
        args: [walletAddress],
      });
      
      const balanceNumber = Number(balance) / 1e6; // USDC has 6 decimals
      lastBalanceUSDC = balanceNumber;
      lastMessage = `Checking USDC balance... ${balanceNumber} USDC (attempt ${displayAttempt}/${maxAttempts})`;
      
      if (balanceNumber > 0) {
        stopSpinner();
        process.stdout.write('\n'); // Move to next line
        return balanceNumber;
      }
    } catch {
      lastMessage = `Checking USDC balance... ${lastBalanceUSDC} USDC (attempt ${displayAttempt}/${maxAttempts})`;
    }

    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
  }
  
  stopSpinner();
  process.stdout.write('\n'); // Move to next line
  return 0;
}
