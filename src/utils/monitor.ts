export async function monitorTransferBalances(
  publicClient: any,
  fromAddress: `0x${string}`,
  toAddress: `0x${string}`,
  usdcContractAddress: string,
  initialFromBalance: number
) {
  // Get initial recipient balance for change tracking
  const initialToBalance = await publicClient.readContract({
    address: usdcContractAddress as `0x${string}`,
    abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
    functionName: "balanceOf",
    args: [toAddress],
  });
  
  let lastFromBalance = initialFromBalance;
  let lastToBalance = Number(initialToBalance) / 1e6;
  
  // Continuously monitor both wallet balances for transfer updates
  while (true) {
    try {
      // Check sender balance
      const fromBalance = await publicClient.readContract({
        address: usdcContractAddress as `0x${string}`,
        abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
        functionName: "balanceOf",
        args: [fromAddress],
      });
      
      // Check recipient balance
      const toBalance = await publicClient.readContract({
        address: usdcContractAddress as `0x${string}`,
        abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
        functionName: "balanceOf",
        args: [toAddress],
      });
      
      const fromBalanceNum = Number(fromBalance) / 1e6;
      const toBalanceNum = Number(toBalance) / 1e6;
      
              // Display balance changes when detected
        if (fromBalanceNum !== lastFromBalance || toBalanceNum !== lastToBalance) {
          const actualFromChange = fromBalanceNum - lastFromBalance;
          const toChange = toBalanceNum - lastToBalance;
          
          const currentTime = new Date().toLocaleTimeString();
          console.log(`\nTransfer Update [${currentTime}]:`);
          console.log(`   Your Wallet: ${fromBalanceNum.toFixed(2)} USDC ${actualFromChange < 0 ? `(-${toChange.toFixed(2)}+fee)` : ''}`);
          console.log(`   Recipient:   ${toBalanceNum.toFixed(2)} USDC ${toChange > 0 ? `(+${toChange.toFixed(2)})` : ''}`);
        
        lastFromBalance = fromBalanceNum;
        lastToBalance = toBalanceNum;
      }
      
      await new Promise((resolve) => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.log(`\nBalance check failed: ${(error as any).message}`);
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
}
