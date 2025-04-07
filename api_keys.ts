import * as dotenv from 'dotenv';
import * as path from 'path';
import * as os from 'os';

dotenv.config({ path: path.join(os.homedir(), '.env') });

// Get API keys from environment variables
const groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
  throw new Error("GROQ_API_KEY not set");
}

const gameApiKey = process.env.GAME_API_KEY;
if (!gameApiKey) {
  throw new Error("GAME_API_KEY not set");
}

const twitterApiKey = process.env.game_twitter_api3;
if (!twitterApiKey) {
  throw new Error("TWITTER_API_KEY not set");
}

const ethscanApiKey = process.env.ETHSCAN_API_KEY;
if (!ethscanApiKey) {
  throw new Error("ETHSCAN_API_KEY not set");
}

const basescanApiKey = process.env.BASESCAN_API_KEY;
if (!basescanApiKey) {
  throw new Error("BASESCAN_API_KEY not set");
}

const baseSepoliascanApiKey = process.env.BASE_SEPOLIASCAN_API_KEY;
if (!baseSepoliascanApiKey) {
  throw new Error("BASE_SEPOLIASCAN_API_KEY not set");
}

const infuraKey = process.env.INFURA_KEY;
if (!infuraKey) {
  throw new Error("INFURA_KEY not set");
}

const lunaWalletAddress = "0x140591903f35375AA78B01272882C2De3AeFE21c";

// Now you can use these variables in your application
export {
  groqApiKey,
  gameApiKey,
  twitterApiKey,
  ethscanApiKey,
  basescanApiKey,
  baseSepoliascanApiKey,
  infuraKey,
  lunaWalletAddress
};