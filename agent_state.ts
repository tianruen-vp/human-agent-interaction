let agentState: Record<string, any[]> = {
    "notRepliedTweets": [],
    "repliedTweetId": [],
    "activeChat": [],
    "activeJobs": [],
    "includes": [],
}; // Initialize as an empty object

const getAgentState = async () => {
    console.log("agentState", agentState);
    return agentState;
}

function updateAgentState(update: any): Record<string, any[]> {
    
    // replyTweetFunction related
    if (update.repliedTweetId) {
        agentState.repliedTweetId.push(update.repliedTweetId);
    }

    if (update.twitterAuthorId && !(update.twitterAuthorId in agentState.activeChat)) {
        agentState.activeChat.push(update.twitterAuthorId);
    }

    if (update.response) {
        if (update.response.isFinished) {
            agentState.activeChat = agentState.activeChat.filter((chat: any) => chat !== update.twitterAuthorId);
        }

        if (update.response.functionCall) {
            if (update.response.functionCall.fn_name === "check_payment" && 
                update.response.functionCall.result.feedback_message.includes("SUCCESS")) {
                    const workingMemory: Record<string, any> = { ...update.workingMemory};
                    delete workingMemory.paid;

                    workingMemory.lastRepliedTweetId = update.repliedTweetId;
                    workingMemory.twitterAuthorId = update.twitterAuthorId;
                    workingMemory.twitterAuthorName = update.twitterAuthorName;

                    agentState.activeJobs.push(workingMemory);
                }
        }
    }
    
    // mentionsFunction related
    if (update.mentions) {
        const repliedTweetIds = agentState.repliedTweetId || [];
        agentState.notRepliedTweets = update.mentions.filter((tweet: any) => !repliedTweetIds.includes(tweet.id));
    }

    if (update.includes) {
        agentState.includes = update.includes;
    }
    
  
    return agentState;
  }

  export { getAgentState, updateAgentState, agentState };