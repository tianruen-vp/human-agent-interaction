import * as fs from 'fs/promises';
import * as path from 'path';

declare global {
    var directoryPath: string;
    var filename: string;
}

const directoryPath = "/agent_state";

async function createInitialAgentState(): Promise<void> {
    try {
        // Create the directory if it doesn't exist
        await fs.mkdir(directoryPath, { recursive: true });
    
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
        const day = now.getDate().toString().padStart(2, '0');
        const hour = now.getHours().toString().padStart(2, '0');
        const minute = now.getMinutes().toString().padStart(2, '0');
        const second = now.getSeconds().toString().padStart(2, '0');
    
        const timestamp = `${year}-${month}-${day}_${hour}-${minute}-${second}`;
        const filename = `${directoryPath}/${timestamp}.json`;
        // const filename = "own_working/agent_state/2025-04-09_14-54-40.json"

        const initialState = {
            "notRepliedTweets": [],
            "repliedTweetId": [],
            "activeChat": [],
            "includes": [],
        }
        const emptyJson = JSON.stringify(initialState, null, 4);
        await fs.writeFile(filename, emptyJson, 'utf-8');

        global.filename = filename;

        console.log(`File "${filename}" created with an empty JSON object.`);
    } catch (error) {
        console.error(`Error creating directory or filename: ${error}`);
        throw error; // Re-throw the error for the calling function to handle
    }
}


let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

async function ensureInitialized() {
    if (isInitialized) {
        return; // Already initialized
    }
    
    if (!initializationPromise) {
        // Start initialization if not already started
        initializationPromise = createInitialAgentState()
            .then(() => {
                isInitialized = true;
            })
            .catch(error => {
                console.error("Failed to initialize agent state:", error);
                throw error;
            });
    }
    
    // Wait for initialization to complete
    await initializationPromise;
}


const getAgentState = async () => {
    await ensureInitialized();
    try {
        const fileContent = await fs.readFile(global.filename, 'utf-8');
        const current_state = JSON.parse(fileContent);
        return current_state;
    } catch (error: any) {
        console.error(`Error reading or parsing JSON from file "${global.filename}": ${error}`);
        return null;
    }
}

async function updateAgentState(update: any): Promise<Record<string, any[]>> {
    const agentState = await getAgentState();
    
    // replyTweetFunction related
    if (update.repliedTweetId) {
        agentState.repliedTweetId.push(update.repliedTweetId);
    }

    if (update.twitterAuthorId && !(update.twitterAuthorId in agentState.activeChat)) {
        agentState.activeChat.push(update.twitterAuthorId);
    }

    if (update.response) {
        if (update.isFinished) {
            agentState.activeChat = agentState.activeChat.filter((chat: any) => chat !== update.twitterAuthorId);
        }

        if (update.fnName) {
            if (update.fnName === "check_payment" && 
                update.info.paid.toString().toLowerCase() === "true") {
                    const workingMemory: Record<string, any> = { ...update.workingMemory};
                    delete workingMemory.paid;
                    delete workingMemory.price;

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

  export { getAgentState, updateAgentState };