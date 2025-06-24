import { contractCall } from "@neardefi/shade-agent-js";
import { authMiddleware } from "../../../utils/auth.js";
import { Evm } from "../../../utils/ethereum.js";

const contractId = process.env.NEXT_PUBLIC_contractId;

async function handler(req, res) {
    const { accountId } = req.user;
    
    try {
        // Call the worker agent to register user in smart contract
        const derivationPath = await contractCall({
            methodName: "register_user",
            args: {}
        });
        
        // Derive ETH address for user
        const { address } = await Evm.deriveAddressAndPublicKey(
            contractId,
            derivationPath
        );
        
        res.status(200).json({
            success: true,
            accountId,
            ethAddress: address,
            derivationPath
        });
    } catch (error) {
        console.error("Registration error:", error);
        
        // Check if user is already registered
        if (error.message && error.message.includes("already registered")) {
            // If already registered, still return their ETH address
            const derivationPath = `ethereum-${accountId}`;
            const { address } = await Evm.deriveAddressAndPublicKey(
                contractId,
                derivationPath
            );
            
            res.status(200).json({
                success: true,
                accountId,
                ethAddress: address,
                derivationPath,
                message: "User already registered"
            });
        } else {
            res.status(500).json({ 
                error: error.message || "Registration failed",
                details: error.toString()
            });
        }
    }
}

export default authMiddleware(handler); 