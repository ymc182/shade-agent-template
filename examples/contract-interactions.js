// Example: How to Call Ethereum Smart Contracts with the Multi-User System

import { NearWallet } from "../utils/near-wallet";
import { ethers } from "ethers";

// Example 1: Call the existing ETH Price Oracle Contract
async function updatePriceOracle(wallet, newPrice) {
    const ethContractAddress = '0xb8d9b079F1604e9016137511464A1Fe97F8e2Bd8';
    const ethContractAbi = [
        {
            "inputs": [{"internalType": "uint256", "name": "_price", "type": "uint256"}],
            "name": "updatePrice",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        }
    ];
    
    // Encode the function call
    const iface = new ethers.utils.Interface(ethContractAbi);
    const data = iface.encodeFunctionData('updatePrice', [newPrice]);
    
    // Prepare the request
    const body = {
        to: ethContractAddress,
        value: "0", // No ETH being sent, just calling function
        data: data,
        message: JSON.stringify({ 
            action: "contract_call", 
            timestamp: Date.now(),
            contract: "price_oracle",
            method: "updatePrice"
        }),
    };
    
    // Sign and send
    const signature = await wallet.signMessage(body.message);
    
    const response = await fetch("/api/user/sendTransaction", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            accountid: wallet.getAccountId(),
            signature: signature,
        },
        body: JSON.stringify(body),
    });
    
    return response.json();
}

// Example 2: Interact with an ERC20 Token
async function transferERC20(wallet, tokenAddress, recipient, amount) {
    const erc20Abi = [
        {
            "inputs": [
                {"internalType": "address", "name": "to", "type": "address"},
                {"internalType": "uint256", "name": "amount", "type": "uint256"}
            ],
            "name": "transfer",
            "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
            "stateMutability": "nonpayable",
            "type": "function"
        }
    ];
    
    const iface = new ethers.utils.Interface(erc20Abi);
    const data = iface.encodeFunctionData('transfer', [recipient, amount]);
    
    const body = {
        to: tokenAddress,
        value: "0",
        data: data,
        message: JSON.stringify({ 
            action: "erc20_transfer", 
            timestamp: Date.now()
        }),
    };
    
    const signature = await wallet.signMessage(body.message);
    
    return fetch("/api/user/sendTransaction", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            accountid: wallet.getAccountId(),
            signature: signature,
        },
        body: JSON.stringify(body),
    });
}

// Example 3: Interact with Uniswap V3
async function swapOnUniswap(wallet, tokenIn, tokenOut, amountIn, minAmountOut) {
    const uniswapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Sepolia
    const swapRouterAbi = [
        {
            "inputs": [{
                "components": [
                    {"internalType": "address", "name": "tokenIn", "type": "address"},
                    {"internalType": "address", "name": "tokenOut", "type": "address"},
                    {"internalType": "uint24", "name": "fee", "type": "uint24"},
                    {"internalType": "address", "name": "recipient", "type": "address"},
                    {"internalType": "uint256", "name": "deadline", "type": "uint256"},
                    {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
                    {"internalType": "uint256", "name": "amountOutMinimum", "type": "uint256"},
                    {"internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160"}
                ],
                "internalType": "struct ISwapRouter.ExactInputSingleParams",
                "name": "params",
                "type": "tuple"
            }],
            "name": "exactInputSingle",
            "outputs": [{"internalType": "uint256", "name": "amountOut", "type": "uint256"}],
            "stateMutability": "payable",
            "type": "function"
        }
    ];
    
    // Get user's ETH address (the recipient)
    const userInfo = await getUserInfo(wallet);
    const recipient = userInfo.ethAddress;
    
    const params = {
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        fee: 3000, // 0.3%
        recipient: recipient,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes
        amountIn: amountIn,
        amountOutMinimum: minAmountOut,
        sqrtPriceLimitX96: 0
    };
    
    const iface = new ethers.utils.Interface(swapRouterAbi);
    const data = iface.encodeFunctionData('exactInputSingle', [params]);
    
    const body = {
        to: uniswapRouterAddress,
        value: tokenIn === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ? amountIn : "0",
        data: data,
        message: JSON.stringify({ 
            action: "uniswap_swap", 
            timestamp: Date.now()
        }),
    };
    
    const signature = await wallet.signMessage(body.message);
    
    return fetch("/api/user/sendTransaction", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            accountid: wallet.getAccountId(),
            signature: signature,
        },
        body: JSON.stringify(body),
    });
}

// Example 4: Deploy a New Contract
async function deployContract(wallet, bytecode, constructorArgs = []) {
    // For deployment, 'to' is null and 'data' is the bytecode + constructor args
    const body = {
        to: null, // null for contract deployment
        value: "0",
        data: bytecode + constructorArgs, // Concatenate bytecode with encoded constructor args
        message: JSON.stringify({ 
            action: "deploy_contract", 
            timestamp: Date.now()
        }),
    };
    
    const signature = await wallet.signMessage(body.message);
    
    return fetch("/api/user/sendTransaction", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            accountid: wallet.getAccountId(),
            signature: signature,
        },
        body: JSON.stringify(body),
    });
}

// Helper function to get user info
async function getUserInfo(wallet) {
    const message = JSON.stringify({ action: "get_info", timestamp: Date.now() });
    const signature = await wallet.signMessage(message);
    
    const response = await fetch("/api/user/info", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            accountid: wallet.getAccountId(),
            signature: signature,
        },
        body: message,
    });
    
    return response.json();
}

// Example Usage:
async function main() {
    // Initialize wallet
    const wallet = new NearWallet();
    await wallet.init();
    
    if (!wallet.isSignedIn()) {
        console.log("Please sign in first");
        return;
    }
    
    // Update price oracle
    const priceUpdate = await updatePriceOracle(wallet, 250000); // $2500.00
    console.log("Price updated:", priceUpdate);
    
    // Transfer ERC20 tokens
    const tokenTransfer = await transferERC20(
        wallet,
        "0x...", // token address
        "0x...", // recipient
        "1000000000000000000" // 1 token (18 decimals)
    );
    console.log("Token transferred:", tokenTransfer);
}

export { updatePriceOracle, transferERC20, swapOnUniswap, deployContract }; 