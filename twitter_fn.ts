import {
    twitterApiKey,
  } from "./api_keys";

import { 
    updateAgentState,
    getAgentState
} from "./agent_state";

import {
    twitterChatAgent,
    checkPaymentFunction,
    determinePriceFunction,
    parseRequirements
} from "./twitter_utils";

import { 
    GameFunction, 
    ExecutableGameFunctionResponse, 
    ExecutableGameFunctionStatus 
} from "@virtuals-protocol/game";

import TwitterPlugin, {
  GameTwitterClient,
} from "@virtuals-protocol/game-twitter-plugin";

import * as fs from 'fs/promises';
import * as path from 'path';

const gameTwitterClient = new GameTwitterClient({
    accessToken: twitterApiKey,
})

let chatDetails: Record<string, any> = {}; // Initialize as an empty object

function filterTweetText(tweetText: string): string {
    const pattern = /^@\w+\s+/;
    return tweetText.replace(pattern, '');
  }


// TODO: add the update state function
// idea: create a dictionary based on the tweet state in python
// then input the tweet state into the getAgentState function

const replyTweetFunction = new GameFunction({
    name: "reply_tweet",
    description: "Use this function to reply to a tweet",
    args: [] as const,
    executable: async (args, logger) => {
        const curAgentState = await getAgentState();

        if (!('notRepliedTweets' in curAgentState) || curAgentState.notRepliedTweets.length === 0) {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "No tweets to reply to. Please use the mentions function to check if there are any new tweets to reply to.",
            );
        }

        const cur_tweet = curAgentState.notRepliedTweets[curAgentState.notRepliedTweets.length - 1];
        console.log(cur_tweet);
        const tweetId = cur_tweet.id;
        const tweetAuthorId = cur_tweet.author_id;
        const tweetAuthorName = curAgentState.includes.users.find(user => user.id === tweetAuthorId).name;
        const tweetText = filterTweetText(cur_tweet.text);

        if ("repliedTweetId" in curAgentState && curAgentState.repliedTweetId.includes(tweetId)) {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "You have already replied to this tweet. Please do not reply to the same tweet twice.",
            );
        }

        let chat: any;
        if (!("activeChat" in curAgentState) || !(tweetAuthorId in curAgentState.activeChat)) {
            chat = await twitterChatAgent.createChat({
                partnerId: tweetAuthorId,
                partnerName: tweetAuthorName,
                actionSpace: [checkPaymentFunction, determinePriceFunction]
            });
        } else {
            chat = chatDetails[tweetAuthorId];
        }

        const response = await chat.next(tweetText);

        // reply to the tweet
        const responseTweet = await gameTwitterClient.reply(tweetId, response.message);
        // record message into chat history
        let chatHistory: string[] = [`User: ${tweetText}`, `Agent: ${response.message}`];
        if ('chatHistory' in chat) {
            chatHistory = [...chat.chatHistory, ...chatHistory];
        }

        // parse the response message
        let workingMemory: Record<string, string> | null = null;
        if (response.functionCall) {
            workingMemory = await parseRequirements(chatHistory);
        }

        // update the chat details after chat.next()
        chat.chatHistory = chatHistory;
        chatDetails.tweetAuthorId = chat;

        let feedback: string;
        if (response.isFinished) {
            delete chatDetails.tweetAuthorId;
            feedback = "Tweet replied successfully. Thread ended.";
        } else {
            feedback = "Tweet replied successfully. Thread continues.";
        }
        
        if (!('data' in responseTweet)) {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "Failed to reply to the tweet. Please try again.",
            );
        }

        const latestAgentState = {
            "repliedTweetId" : tweetId,
            "twitterAuthorId" : tweetAuthorId,
            "twitterAuthorName" : tweetAuthorName,
            "response": response,
            "workingMemory": workingMemory,
        }
        
        updateAgentState(latestAgentState);

        return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            feedback,
        );
    }
})

const mentionsFunction = new GameFunction({
    name: "mentions",
    description: "Use this function to get the mentions from twitter",
    args: [] as const,
    executable: async (args, logger) => {
        const mentions = await gameTwitterClient.mentions();

        const ignoreTweetIdsPath = "/Users/tianruen/Documents/agent-feature-test/GAME_poc_demos/acp/ignore_tweet_id.txt";
        let ignoreTweetIds: string[] = [];

        const fileContent = await fs.readFile(ignoreTweetIdsPath, 'utf-8');
        ignoreTweetIds = fileContent.split('\n').map(line => line.trim());
        
        // try {
        //     const fileContent = await fs.readFile(ignoreTweetIdsPath, 'utf-8');
        //     ignoreTweetIds = fileContent.split('\n').map(line => line.trim());
        // } catch (error) {
        //     console.error(`Error reading ignore tweet IDs file: ${error}`);
        //     // Handle the error appropriately, e.g., return an empty array or throw
        //     return [];
        // }

        const mentionsData: any[]= [];
        for (const mention of mentions.data) {
            if (!ignoreTweetIds.includes(mention.id)) {
                mentionsData.push(mention);
            }
        }

        const latestAgentState = {
            "mentions": mentionsData,
            "includes": mentions.includes,
        }
        
        updateAgentState(latestAgentState);
        
        const updatedState = await getAgentState();
        if (updatedState.notRepliedTweets.length > 0) {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Done,
                "Mentions fetched successfully. There are tweets to reply to. Please use the reply_tweet function to reply to the tweets.",
            );
        } else {
            return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Done,
                "No mentions to reply to. Please use the wait function to wait for a certain amount of time.",
            );
        }
    }
})

const waitFunction = new GameFunction({
    name: "wait",
    description: "Use this function to wait for a certain amount of time. use this function if you think there's no need to do anything at the moment.",
    args: [] as const,
    executable: async (args, logger) => {
        await new Promise(resolve => setTimeout(resolve, 60000));
        return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            "Waited for 1 minute",
        );
    }
})
export {
    replyTweetFunction,
    mentionsFunction,
    waitFunction
}