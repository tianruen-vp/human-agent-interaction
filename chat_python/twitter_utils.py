import sys
import os
from typing import Tuple
from datetime import datetime, timedelta, timezone
import json
import requests
from openai import OpenAI
from web3 import Web3
from dotenv import load_dotenv
load_dotenv()

from game_sdk.game.chat_agent import ChatAgent, Chat
from game_sdk.game.custom_types import Function, Argument, FunctionResultStatus

import chat_python.luna_chat_prompt as luna_chat_prompt

game_api_key = os.getenv("game_api_for_twitter")
if not game_api_key:
    raise ValueError("GAME_API_KEY not set")

groq_api_key = os.getenv("GROQ_API_KEY")
if not groq_api_key:
    raise ValueError("GROQ_API not set")
groq_client = OpenAI(api_key=groq_api_key, base_url="https://api.groq.com/openai/v1")

ethscan_api_key = os.getenv("ETHSCAN_API_KEY")
if not ethscan_api_key:
    raise ValueError("ETHSCAN_API_KEY not set")

basescan_api_key = os.getenv("BASESCAN_API_KEY")
if not basescan_api_key:
    raise ValueError("BASESCAN_API_KEY not set")

base_sepoliascan_api_key = os.getenv("BASE_SEPOLIASCAN_API_KEY")
if not base_sepoliascan_api_key:
    raise ValueError("BASE_SEPOLIASCAN_API_KEY not set")

infura_key = os.getenv("INFURA_KEY")
if not infura_key:
    raise ValueError("INFURA_KEY not set")

usdc_address = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
usdc_address = Web3.to_checksum_address(usdc_address)
usdc_abi = [{
    "inputs": [
        {"internalType": "address", "name": "recipient", "type": "address"},
        {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "transfer",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
}]
w3 = Web3(Web3.HTTPProvider(f"https://mainnet.infura.io/v3/{infura_key}"))
usdc_contract = w3.eth.contract(address=usdc_address, abi=usdc_abi)


luna_wallet_address = "0x140591903f35375AA78B01272882C2De3AeFE21c"

def parse_requiremnts(msgs: list[str]) -> dict:
    system_prompt = """
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
    """
    i = 0
    convo_str = ""
    for c in msgs:
        if i % 2 == 0:
            convo_str += f"USER: {c}\n"
        else:
            convo_str += f"AGENT: {c}\n"
        i += 1
    
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": convo_str}]
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.3,
        response_format={"type": "json_object"}
    )

    return json.loads(response.choices[0].message.content)

def determine_price_executable(services:list[str]) -> Tuple[FunctionResultStatus, str, dict]:
    if not services:
        return FunctionResultStatus.FAILED, "No services provided. Please input services.", {}
    
    final_price = 0
    num_services = 0

    if "token narrative & GTM strategy" in services:
        final_price += 10
        num_services += 1
    
    if "avatar design" in services:
        final_price += 10
        num_services += 1

    if "meme images" in services:
        final_price += 5
        num_services += 1
    
    if "music generation" in services:
        final_price += 5
        num_services += 1
    
    if "launch video" in services:
        final_price += 20
        num_services += 1
    
    if "on-chain minting" in services:
        final_price += 10

    if num_services == 6:
        final_price = 50
    
    return FunctionResultStatus.DONE, f"The price of the services is {final_price} USDC.", {"services": services, "price": final_price}

determine_price_fn = Function(
    fn_name="determine_price",
    fn_description="Use this function to determine the price of a package based on the user's requirements",
    args=[
        Argument(name="services", description="The services that the customer wants. Can be a combination of 'token narrative & GTM strategy', 'avatar design', 'meme images', 'music generation', 'launch video', or 'on-chain minting'", type="list[str]"),
    ],
    executable=determine_price_executable,
)

# class get_transaction_value:
#     def __init__(self, explorer: str="ethscan", token: str="ether"):
#         keyword_api = explorer.upper() + "_API_KEY"
#         self.api_key = os.getenv(keyword_api)
#         self.explorer = explorer
#         self.token = token

#     def get_transaction_value(self, transaction_hash: str):
#         return get_transaction_value(transaction_hash, self.api_key, self.explorer, self.token)


def get_transaction_details(transaction_hash: str):
    """
    Get transaction details from a blockchain explorer.

    Args:
        transaction_hash (str): The transaction hash.
        api_key (str): Your API key for the blockchain explorer.
        explorer (str): The blockchain explorer. Only accepts 'ethscan' or 'basescan'.
        token (str): The token symbol.
    """
    global ethscan_api_key, basescan_api_key, base_sepoliascan_api_key, infura_key
    
    usdc_address_ethscan = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    usdc_address_basescan = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    usdc_address_basescan_sepolia = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

    usdc_abi = [{
        "inputs": [
            {"internalType": "address", "name": "recipient", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"}
        ],
        "name": "transfer",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function"
    }]
    
    networks = [
        {
            "explorer": "ethscan",
            "api_url": "https://api.etherscan.io/api",
            "api_key": ethscan_api_key,
            "w3_http_provider": f"https://mainnet.infura.io/v3/{infura_key}",
            "usdc_address": Web3.to_checksum_address(usdc_address_ethscan),
        },
        {
            "explorer": "basescan",
            "api_url": "https://api.basescan.org/api",
            "api_key": basescan_api_key,
            "w3_http_provider": f"https://base-mainnet.infura.io/v3/{infura_key}",
            "usdc_address": Web3.to_checksum_address(usdc_address_basescan),
        },
        # {
        #     "explorer": "basescan-sepolia",
        #     "api_url": "https://api-sepolia.basescan.org/api",
        #     "api_key": base_sepoliascan_api_key,
        #     "w3_http_provider": f"https://sepolia.base.org",
        #     "usdc_address": Web3.to_checksum_address(usdc_address_basescan_sepolia),
        # },
    ]

    for network in networks:
        try:
            params = {
                'module': 'proxy',
                'action': 'eth_getTransactionByHash',
                'txhash': transaction_hash,
                'apikey': network['api_key'],
            }
            response = requests.get(network['api_url'], params=params)
            response.raise_for_status()
            data = response.json()
            transaction_details = data['result']

            if transaction_details:
                if transaction_details['to'].lower() != network['usdc_address'].lower():
                    return "Error", "Not a USDC transaction.", None
                
                block_number_hex = transaction_details["blockNumber"]
                block_params = {
                    "module": "proxy",
                    "action": "eth_getBlockByNumber",
                    "tag": block_number_hex,
                    "boolean": "true",
                    "apikey": network['api_key'],
                }

                w3 = Web3(Web3.HTTPProvider(network['w3_http_provider']))
                usdc_contract = w3.eth.contract(address=network['usdc_address'], abi=usdc_abi)
                decoded_input = usdc_contract.decode_function_input(transaction_details['input'])
                usdc_value = decoded_input[1]['amount'] * 1e-6
                receiver_address = decoded_input[1]['recipient']

                block_response = requests.get(network['api_url'], params=block_params)
                block_response.raise_for_status()
                block_data = block_response.json()
                timestamp_hex = block_data["result"]["timestamp"]
                timestamp_int = int(timestamp_hex, 16)
                transaction_time = datetime.utcfromtimestamp(timestamp_int)

                print(f"Transaction found on {network['explorer']}.")
                return usdc_value, receiver_address, transaction_time
            
        except requests.exceptions.RequestException as e:
            print(f"Error during API request for {network['explorer']}: {e}")
            pass
        except Exception as e:
            print(f"An error occurred: {e}")
            return "Error", e, None
        
    return "Error", "Transaction not found on Ethereum or Base networks.", None
    

def check_payment_executable(transaction_hash: str, price: int):
    global luna_wallet_address
    if not transaction_hash:
        return FunctionResultStatus.FAILED, "Transaction hash empty. Please ask the user to provide a valid transaction hash.", {"paid": False}
    if not price:
        return FunctionResultStatus.FAILED, "Price empty. Please input a valid price.", {"paid": False}
    
    print(f"Checking payment for transaction hash: {transaction_hash}")
    value, receiver_address, txn_time = get_transaction_details(transaction_hash)

    if value == "Error":
        return FunctionResultStatus.FAILED, f"Transaction not found or error. Please input a valid transaction hash. Error: {receiver_address}", {"paid": False}
    if value is None:
        return FunctionResultStatus.FAILED, "Transaction not found or error. Please input a valid transaction hash. Value in the contract is None.", {"paid": False}
    
    cur_utc_time = datetime.now(timezone.utc).replace(tzinfo=None)
    time_diff = cur_utc_time - txn_time
    if time_diff.days > 0 or time_diff.seconds > 60 * 10:
        return FunctionResultStatus.FAILED, f"The transaction was made more than 10 minutes ago. Please ask the user to make a new payment and send the transaction hash within 10 minutes after making the payment.", {"paid": False}
    if receiver_address.lower() != luna_wallet_address.lower():
        return FunctionResultStatus.FAILED, f"The user has not paid to the correct address. Please ask the user to send the payment to the correct address, which is {luna_wallet_address}.", {"paid": False, "txn_value": value, "product_price": price}
    if value < price:
        return FunctionResultStatus.FAILED, f"The user has not paid the full amount. The user has paid {value} USDC. Please ask the user to pay {price - value} USDC.", {"paid": False, "txn_value": value, "product_price": price}
    
    if value >= price and receiver_address == luna_wallet_address.lower() and time_diff.days == 0 and time_diff.seconds <= 60 * 10:
        return FunctionResultStatus.DONE, f"The user has paid {value} USDC for the product.", {"paid": True, "txn_value": value, "product_price": price}
    else:
        return FunctionResultStatus.FAILED, f"The user has not paid for the product. The amount paid is {value} USDC.", {"paid": False, "txn_value": value, "product_price": price}

check_payment_fn = Function(
    fn_name="check_payment",
    fn_description="Use this function to check if the user has paid for the product based on the transaction hash provided by the user. Only use this function if you have already asked the user to pay for the product. Else, you should not use this function AT ALL.",
    args=[
        Argument(name="transaction_hash", description="The transaction hash of the payment.", type="str"),
        Argument(name="price", description="The price of the product. This should be given by the system.", type="float"),
    ],
    executable=check_payment_executable,
)

chat_agent_prompt = f"""
Your job is to gather useful information from the user regarding their requirements on a digital art.

Collect the below information from the user:
    - content: what to draw
    - style: what style of art (e.g. cartoon, realistic, abstract, etc.)
    - size: what size of the art (e.g. 1024x1024, 512x512, etc.). The output should be in the format of <width>x<height>
    - number of images: how many images to generate
    - format: what format to generate the art in (e.g. png, jpg, etc.)
    - special requests: any specific requests for the art

Once you collected the information, you will need to determine the price of the product based on the user's requirements.
Use the DeterminePriceFunction to determine the price of the product by inputting the product.
The product can only be either 'video' or 'poster'.

You should tell the user the price of the product after determining the price. Also ask the user to pay for the product on the same message.

Lastly, check if the user has paid for the product. Use the check_payment function to check if the user has paid for the product.
"""

twitter_chat_agent = ChatAgent(
    api_key=game_api_key,
    prompt=luna_chat_prompt.lunaChatPrompt,
)