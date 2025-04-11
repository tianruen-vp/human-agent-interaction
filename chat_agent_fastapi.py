from fastapi import FastAPI
from pydantic import BaseModel

from game_sdk.game.chat_agent import Chat, ChatAgent
import api
from twitter_utils import determine_price_fn, check_payment_fn, twitter_chat_agent, parse_requiremnts

app = FastAPI()

chat_details = {}

class userDetails(BaseModel):
    partner_id: str
    partner_name: str

class chatInput(BaseModel):
    partner_id: str
    partner_name: str
    message: str

@app.get("/get_chat")
def get_chat(partner_id: str, partner_name: str, message: str):
    if partner_id not in chat_details:
        chat = twitter_chat_agent.create_chat(
            partner_id=partner_id, 
            partner_name=partner_name, 
            action_space=[determine_price_fn, check_payment_fn]
        )
        cur_chat_details = chat.__dict__
        chat_details[partner_id] = cur_chat_details
    else:
        chat = Chat(conversation_id=chat_details[partner_id]["chat_id"], client=twitter_chat_agent.client)

        for key in chat.__dict__.keys():
            chat.__setattr__(key, chat_details[partner_id][key])
    
    response = chat.next(message)

    chat_history = [message, response.message]
    if "chat_history" in chat_details[partner_id]:
        chat_history = chat_details[partner_id]["chat_history"] + chat_history
    
    if response.function_call:
        working_memory = parse_requiremnts(chat_history)
    else:
        working_memory = None

    cur_chat_details = chat.__dict__
    cur_chat_details["chat_history"] = chat_history
    cur_chat_details["working_memory"] = working_memory
    
    chat_details[partner_id] = cur_chat_details
    
    output = {
        "chat_id": chat_details[partner_id]["chat_id"],
        "chat_history": chat_details[partner_id]["chat_history"],
        "working_memory": chat_details[partner_id]["working_memory"],
        "message": response.message,
        "is_finished": response.is_finished,
    }
    
    if response.function_call:
        function_call_deatails = {
            "fn_name": response.function_call.fn_name,
            "fn_args": response.function_call.fn_args,
            "result_status": response.function_call.result.action_status,
            "feedback_message": response.function_call.result.feedback_message,
            "info": response.function_call.result.info
        }
        output = {**output, **function_call_deatails}
    
    return output