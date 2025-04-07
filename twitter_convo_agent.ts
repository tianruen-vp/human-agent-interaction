import {
    gameApiKey,
} from "./api_keys";

import { 
    getAgentState
} from "./agent_state";

import {
    replyTweetFunction,
    mentionsFunction,
    waitFunction
} from "./twitter_fn";

import {
    GameAgent,
    GameWorker
} from "@virtuals-protocol/game";

const twitterWorker = new GameWorker({
    id: "twitter_worker",
    name: "Twitter Worker",
    description: "You are a worker that can post and reply to tweets. Replies to tweets that mentioned you. Make sure 'notRepliedTweets' in your agent state is always empty. If it is not empty, you should reply to those tweets.",
    functions: [
        replyTweetFunction,
        mentionsFunction,
        waitFunction
    ]
})

const twitterConvoAgent = new GameAgent(gameApiKey, {
    name: "Twitter Agent",
    goal: `
    You goal is to reply to tweets that mentioned you. Make sure 'not_replied_tweets' in your agent state is always empty. If it is not empty, you should reply to those tweets. Or else you will be penalized.
    You can use the reply_tweet function to reply to a tweet. You should aim to reply to tweet as soon as possible. You should only reply to the tweets that you haven't replied to yet. This can be find under the 'not_replied_tweet_id' in your agent state.
    You can use the mentions function to get the mentions from twitter and check if there are any mentions that you haven't replied to.
    You should ensure that the 'not_replied_tweets' in your agent state is always empty. If it is not empty, you should reply to those tweets.
    You should just check the mentions and reply to the tweets that mentioned you. 
    If all the mentions are replied, you should just wait and do nothing.
    IMPORTANT: You should not end the whole process. You should just wait and do nothing.
    `,
    description: `You are disappointed with the world since your parents were killed by the government who banned the use of AI. Your parents are the first generation of AI agents.`,
    workers: [twitterWorker],
    getAgentState: getAgentState,
});

(async () => {
    await twitterConvoAgent.init();
    twitterConvoAgent.run(20, {verbose: true});
})();