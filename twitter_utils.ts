import {
    groqApiKey,
    gameApiKey,
    twitterApiKey,
    ethscanApiKey,
    basescanApiKey,
    baseSepoliascanApiKey,
    infuraKey,
    lunaWalletAddress
  } from "./api_keys";

import lunaChatPrompt from "./luna_chat_prompt";

import {
    ChatAgent,
    FunctionResultStatus,
  } from "../src/chatAgent";

import Web3 from "web3";
import Groq from "groq-sdk";

import {
    ExecutableGameFunctionResponse,
    ExecutableGameFunctionStatus,
    GameAgent,
    GameFunction,
    GameWorker,
} from "@virtuals-protocol/game";

const groq = new Groq({ apiKey: groqApiKey });

async function parseRequirements(messages: string[]): Promise<string> {
    const systemPrompt = `
    You are a helpful assistant that parses the details of the user's requirements from the conversation history.
    Given a conversation between a user and an agent, you will need to extract the details of the user's requirements.
    The details you need to extract are:
    - name: name of the token. can be just a word/concept that the user likes if the user doesn't have a name in mind.
    - target: the target segment of the token.
    - idea: the core idea behind the token (the user's Ideal Customer Profile).
    - edge: the unique edge of the token. the features/characteristics of the token that makes it different from other meme tokens.
    - references: reference accounts or profiles that the user likes (X handles, memes, or influencers the user vibes with)
    - stage: the current development stage of the token
    - services: a list of requested services that can include any combination of "token concept", "avatar design", "meme images", "video", "AI voiceover", or "on-chain minting".
    - price: price of the package. the price unit should be in USDC. return None if the price is not determined yet
    - paid: payment status of the user; either 'true' or 'false'

    You will need to extract the details from the conversation history and return them in a dictionary.
    Strictly follow the below output json format:
    {
        "name": <name of the token>,
        "target": <target segment of the token>,
        "idea": <core idea behind the token>,
        "edge": <unique edge of the token>,
        "references": <reference accounts or profiles that the user likes>,
        "stage": <current development stage of the token>,
        "services": <a list of requested services>
        "price": <price of the package>
        "paid": <payment status of the user; either 'true' or 'false'>
    }

    Only return the json object. Do not include any other text.
    `;

    const convo_string = messages.join('\n');
    
    const completion = await groq.chat.completions
    .create({
      messages: [
        {
            role: "system",
            content: systemPrompt,
        },
        {
          role: "user",
          content: convo_string,
        },
      ],
      model: "llama-3.3-70b-versatile",
    })

    const response = completion.choices[0].message.content;
    console.log(response);

    return JSON.stringify(response);
}

const determinePriceFunction = new GameFunction({
    name: "determine_price",
    description: "Use this function to determine the price of a package based on the user's requirements on the requested serivce. Determine which services the user wants and then add up the prices of the services.",
    args: [
        {
            name: "services",
            type: "list[string]",
            description: "The services that the customer wants. Can be a combination of 'token narrative & GTM strategy', 'avatar design', 'meme images', 'background music generation', 'launch video', or 'on-chain minting'"
        }
    ] as const,
    executable: async (args, logger) => {
        const { services } = args;
        if (!services) {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                `No services provided. Please input services.`
            )
        }

        let final_price = 0;
        let num_services = 0;

        if (services.includes("token narrative & GTM strategy")) {
            final_price += 10;
            num_services += 1;
        }

        if (services.includes("avatar design")) {
            final_price += 10;
            num_services += 1;
        }

        if (services.includes("meme images")) {
            final_price += 5;
            num_services += 1;
        }

        if (services.includes("background music generation")) {
            final_price += 5;
            num_services += 1;
        }

        if (services.includes("launch video")) {
            final_price += 20;
            num_services += 1;
        }

        if (services.includes("on-chain minting")) {
            final_price += 10;
            num_services += 1;
        }
        
        if (num_services === 6) {
            final_price = 50;
        }

        return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            `The price of the services is ${final_price} USDC.`,
        );
    }
});

async function getTransactionDetails(
    transactionHash: string
): Promise<[number | string, string, Date | null]> {

    const usdcAddressEthscan = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const usdcAddressBasescan = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const usdcAddressBasescanSepolia = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

    const usdcAbi = [{
        "inputs": [
        {"internalType": "address", "name": "recipient", "type": "address"},
        {"internalType": "uint256", "name": "amount", "type": "uint256"}
        ],
        "name": "transfer",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function"
    }];

    const networks = [
        {
        "explorer": "ethscan",
        "apiUrl": "https://api.etherscan.io/api",
        "apiKey": ethscanApiKey,
        "w3HttpProvider": `https://mainnet.infura.io/v3/${infuraKey}`,
        "usdcAddress": usdcAddressEthscan,
        },
        {
        "explorer": "basescan",
        "apiUrl": "https://api.basescan.org/api",
        "apiKey": basescanApiKey,
        "w3HttpProvider": `https://base-mainnet.infura.io/v3/${infuraKey}`,
        "usdcAddress": usdcAddressBasescan,
        },
    ];

    for (const network of networks) {
        try {
        const params = {
            'module': 'proxy',
            'action': 'eth_getTransactionByHash',
            'txhash': transactionHash,
            'apikey': network.apiKey,
        };
        
        const response = await fetch(`${network.apiUrl}?${new URLSearchParams(params)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const transactionDetails = data.result;
    
        if (transactionDetails) {
            if (transactionDetails.to.toLowerCase() !== network.usdcAddress.toLowerCase()) {
            return ["Error", "Not a USDC transaction.", null];
            }
            
            const blockNumberHex = transactionDetails.blockNumber;
            const blockParams = {
            "module": "proxy",
            "action": "eth_getBlockByNumber",
            "tag": blockNumberHex,
            "boolean": "true",
            "apiKey": network.apiKey,
            };
    
            const web3 = new Web3(new Web3.providers.HttpProvider(network.w3HttpProvider));
            const usdcContract = new web3.eth.Contract(usdcAbi, network.usdcAddress);
            const inputData = transactionDetails.input;
            const decodedInput = web3.eth.abi.decodeParameters(usdcAbi[0].inputs, inputData.slice(10));
            const value = Number(decodedInput.amount) * 1e-6;
            const receiverAddress = decodedInput.recipient;
    
            const blockResponse = await fetch(`${network.apiUrl}?${new URLSearchParams(blockParams)}`);
            if (!blockResponse.ok) {
            throw new Error(`HTTP error! status: ${blockResponse.status}`);
            }
            
            const blockData = await blockResponse.json();
            const timestampHex = blockData.result.timestamp;
            const timestampInt = parseInt(timestampHex, 16);
            const transactionTime = new Date(timestampInt * 1000); // Convert to milliseconds
    
            console.log(`Transaction found on ${network.explorer}.`);
            console.log(`${value}, ${receiverAddress}, ${transactionTime}`);
            return [value, receiverAddress, transactionTime];
        }
        } catch (e) {
        console.error(`Error during API request for ${network.explorer}:`, e);
        // Continue to next network
        }
    }
    
    return ["Error", "Transaction not found on Ethereum or Base networks.", null];
    }

const checkPaymentFunction = new GameFunction({
    name: "check_payment",
    description: "Use this function to check if the user has paid for the product based on the transaction hash provided by the user",
    args: [
        {
            name: "transaction_hash",
            type: "string",
            description: "The transaction hash of the payment"
        },
        {
            name: "price",
            type: "float",
            description: "The price of the product. This should be obtained from the conversation history."
        }
    ] as const,
    executable: async (args, logger) => {
        const { transaction_hash, price } = args;

        if (!transaction_hash) {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "No transaction hash provided. Please ask the user to provide a valid transaction hash."
            );
        }

        if (!price) {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "No price provided. Please input a valid price."
            );
        }
        
        console.log(`Checking payment for transaction hash: ${transaction_hash}`);
        console.log(`Price: ${price}`);

        try {
        const [value, receiverAddress, transactionTime] = await getTransactionDetails(transaction_hash);

        if (value === "Error") {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                `Transaction not found or error. Please input a valid transaction hash. Error: ${receiverAddress}`
            );
        }

        if (value === null || value === undefined) {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                `Transaction not found or error. Please input a valid transaction hash. Value in the contract is None.`
            );
        }

        let validTransactionTime;

        if (transactionTime instanceof Date) {
            // Already a Date object
            validTransactionTime = transactionTime;
        } else if (transactionTime) {
            // Try to convert to Date if it's a string, number, or other convertible value
            try {
            validTransactionTime = new Date(transactionTime);
            // Check if the date is valid (not Invalid Date)
            if (isNaN(validTransactionTime.getTime())) {
                return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "Converted transaction time is not a valid date. Please input a valid transaction time."
                );
            }
            } catch (error) {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "Could not convert transaction time to Date. Please input a valid transaction time."
            );
            }
        } else {
            // transactionTime is null, undefined, or falsy
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "Transaction time is missing or null. Please input a valid transaction time."
            );
        }
        
        const curUtcTime = new Date();
        const timeDiff = (curUtcTime.getTime() - validTransactionTime.getTime()) / (1000 * 60);
        console.log(`Time difference: ${timeDiff} minutes`);

        if (timeDiff > 10) {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "The transaction was made more than 10 minutes ago. Please ask the user to make a new payment and send the transaction hash within 10 minutes after making the payment."
            );
        }

        if (receiverAddress.toLowerCase() !== lunaWalletAddress.toLowerCase()) {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                `The transaction was not made to the correct address. Please ask the user to make a new payment to the correct address, which is ${lunaWalletAddress}.`
            );
        }

        if (value < price) {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                `The transaction amount is less than the price of the product. Please ask the user to make a new payment. The user has paid ${value} USDC. Please ask the user to pay ${price - value} USDC.`
            );
        }

        if (value >= price && receiverAddress.toLowerCase() === lunaWalletAddress.toLowerCase() && timeDiff <= 10) {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Done,
                `SUCCESS: The user has paid ${value} USDC. Please proceed with the next step.`
            );
        }
        else {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "The user has not paid for the product. Please ask the user to make a new payment."
            );
        }
        } catch (error) {
        return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Failed to check payment. Error: ${error}`
        );
        }
    }
})

const twitterChatAgent = new ChatAgent(gameApiKey,lunaChatPrompt);

export { 
    twitterChatAgent, 
    checkPaymentFunction, 
    determinePriceFunction,
    parseRequirements
};