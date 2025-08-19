import { startSpinner, stopSpinner } from './spinner';

export async function checkUSDCBalance(publicClient: any, walletAddress: `0x${string}`, usdcContractAddress: string) {
  console.log("Waiting for USDC balance to be greater than 1...");
  console.log("Please visit https://faucet.circle.com/ to get USDC");
  console.log(`Send USDC to: ${walletAddress}\n`);
  
  let lastMessage = `Checking USDC balance...`;

  startSpinner(() => lastMessage);
  
  while (true) {
    try {
      const balance = await publicClient.readContract({
        address: usdcContractAddress as `0x${string}`,
        abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
        functionName: "balanceOf",
        args: [walletAddress],
      });
      
      const balanceNumber = Number(balance) / 1e6;
      
      if (balanceNumber > 1) {
        stopSpinner();
        process.stdout.write('\n');
        console.log(`USDC balance detected: ${balanceNumber} USDC`);
        return balanceNumber;
      }
    } catch {
      // Continue checking
    }

    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
}
