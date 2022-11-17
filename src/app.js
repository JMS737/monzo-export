/* TODO
- [ ] Add error handling around 403 (unauthorised) errors.
- [ ] Send an email notifying the user that the service needs to be reauthenticated.
- [ ] Create an endpoint which triggers an upload of the output file using the Firefly III Data Importer REST API.
*/

// Load .env values into process.env
import dotenv from "dotenv";
dotenv.config();

// Import required libraries.
import express from "express";
import { readFile, writeFile, copyFile, mkdir } from 'fs/promises';
import { parse, URLSearchParams } from 'url';
import { stringify as _stringify } from 'csv-stringify';
import format from 'date-format';
import axios from "axios";

const stringify = _stringify;

const hostname = process.env.HOSTNAME;
const port = Number(process.env.PORT);
const server = express();

const OUTPUT_FILENAME = process.env.OUTPUT_FILENAME

// Authorization Values
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const STATE = process.env.STATE;
const MONZO_AUTH_ENDPOINT = process.env.MONZO_AUTH_ENDPOINT;
const MONZO_TOKEN_PATH = process.env.MONZO_TOKEN_PATH;
const MONZO_API_ENDPOINT = process.env.MONZO_API_ENDPOINT;
const REDIRECT_URI = process.env.REDIRECT_URI;
const TOKEN_FILE = process.env.TOKEN_FILE;
const OUTPUT_DIRECTORY = process.env.OUTPUT_DIRECTORY;
const ARCHIVE_DIRECTORY = process.env.ARCHIVE_DIRECTORY;
const TOKEN_DIRECTORY = process.env.TOKEN_DIRECTORY;
const CONFIG_DIRECTORY = process.env.CONFIG_DIRECTORY;

// Session Values
let ACCESS_TOKEN = undefined;
let REFRESH_TOKEN = undefined;
let USER_ID = undefined;

await Setup();

server.get('/', (req, res) => {
    res.status(200).send('Hello world');
});

server.get('/auth', (req, res) => {
    res.redirect(`${MONZO_AUTH_ENDPOINT}/?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&state=${STATE}`);
});

server.get('/callback', async (req, res) => {
    const queryObject = parse(req.url, true).query;
    console.log(queryObject);

    const code = queryObject.code;
    const state = queryObject.state;

    if (state != STATE) {
        return res.status(400).send("State did not match");
    }

    await GetAccessToken(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, code);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('Try adding some query parameters to the end of the url.');
    // res.send('Try adding some query parameters to the end of the url.');
})

server.get('/whoami', async (req, res) => {
    const data = await WhoAmI();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
})

server.get('/accounts', async (req, res) => {
    const data = await GetAccounts();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
})

server.get('/transactions', async (req, res) => {
    const queryObject = parse(req.url, true).query;
    const data = await GetTransactions(queryObject.since);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
})

server.get('/export/transactions', async (req, res) => {
    const queryObject = parse(req.url, true).query;
    const data = await GetTransactions(queryObject.since);
    TransactionsToCsv(TransformTransactions(data.transactions));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
})

server.get('/export/transactions/latest', async (req, res) => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    date.setHours(0, 0, 0 ,0);
    const since = date.toISOString();
    console.log(since);

    const data = await GetTransactions(since);
    TransactionsToCsv(TransformTransactions(data.transactions));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
})

server.listen(port, hostname, () => {
    console.log(`Server is running at http://${hostname}:${port}/`);
});

async function GetAccessToken(client_id, client_secret, redirect_uri, authCode) {
    const data = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: client_id,
        client_secret: client_secret,
        redirect_uri: redirect_uri,
        code: authCode
    }).toString();

    console.log(`Getting new access token. Sending request: ${MONZO_API_ENDPOINT}${MONZO_TOKEN_PATH}; Body: ${data}`);

    try {
        await axios.post(`${MONZO_API_ENDPOINT}${MONZO_TOKEN_PATH}`, data);
        StoreToken(res.data.access_token, res.data.refresh_token, res.data.user_id);
    } catch (error) {
        console.error(error);
    }
}

async function RefreshAccessToken(client_id, client_secret, refresh_token) {
    const data = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: client_id,
        client_secret: client_secret,
        refresh_token: refresh_token
    }).toString();

    console.log(`Refreshing access token. Sending request: ${MONZO_API_ENDPOINT}${MONZO_TOKEN_PATH}; Body: ${data}`);

    try {
        const response = await axios.post(`${MONZO_API_ENDPOINT}${MONZO_TOKEN_PATH}`, data);
        StoreToken(response.data.access_token, response.data.refresh_token, response.data.user_id);

    } catch (error) {
        console.error(error);
    }
}

async function StoreToken(access_token, refresh_token, user_id) {
    ACCESS_TOKEN = access_token;
    REFRESH_TOKEN = refresh_token;
    USER_ID = user_id;

    try {
        await writeFile(`${TOKEN_DIRECTORY}/${TOKEN_FILE}`, REFRESH_TOKEN);
    } catch (error) {
        console.error(error);
        return;
    }

    console.log(`Sucessfully stored access tokens:`);
    console.log(`Access Token: ${ACCESS_TOKEN}`);
    console.log(`Refresh Token: ${REFRESH_TOKEN}`);
    console.log(`User ID: ${USER_ID}`);
}

async function WhoAmI() {
    console.log('Pinging /whoami endpoint.');
    try {
        const response = await axios.get(`${MONZO_API_ENDPOINT}/ping/whoami`, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } })
        console.log(response.data);
        // return response.data;
    } catch (error) {
        console.error('Failed to call /whoami endpoint.');
        // console.error(error);
    }
}

async function GetTransactions(since) {
    const account = await GetAccount();
    return await GetTransactionsForAccount(account, since);
}

async function GetTransactionsForAccount(account_id, since) {
    try {
        const params = {
            account_id: account_id
        };

        if (since != undefined) {
            params.since = since;
        }

        const qs = new URLSearchParams(params).toString();
        const response = await axios.get(`${MONZO_API_ENDPOINT}/transactions?expand[]=merchant&${qs}`, {
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`
            }
        });
        // console.log(response.data);
        return response.data
    } catch (error) {
        console.error('Failed to get transactions.');
        console.error(error);
    }
}

async function GetAccount() {
    try {
        const response = await axios.get(`${MONZO_API_ENDPOINT}/accounts/`, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
        // console.log(response.data);
        return response.data.accounts[0].id;
    } catch (error) {
        console.error('Failed to get account.');
        // console.error(error);
    }
}

async function GetAccounts() {
    try {
        const response = await axios.get(`${MONZO_API_ENDPOINT}/accounts/`, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
        // console.log(response.data);
        return response.data;
    } catch (error) {
        console.error('Failed to get accounts.');
        // console.error(error);
    }
}

function TransformTransactions(transactions) {
    return transactions.map((transaction) => {
        const createdDate = new Date(transaction.created);
        const regex = /\s+/g
        return {
            id: transaction.id,
            date: format("yyyy/MM/dd", createdDate),
            time: format("hh:mm:ss", createdDate),
            type: transaction.scheme,
            merchant: transaction.merchant?.name,
            counterparty_account: transaction.counterparty?.account_number,
            category: transaction.category,
            amount: transaction.amount / 100,
            currency: transaction.currency,
            notes: transaction.notes,
            description: transaction.description.replace(regex, ' ')
        }
    });
}

function TransactionsToCsv(transactions) {
    console.log("Converting to csv");
    stringify(transactions, { header: true }, async (err, output) => {
        if (err) {
            console.error(err);
            return;
        }

        try {
            const filename = `${OUTPUT_DIRECTORY}/${OUTPUT_FILENAME}`;
            await writeFile(filename, output);
            await copyFile(filename, `${ARCHIVE_DIRECTORY}/monzo_${format('yyyyMMdd_hhmmss', new Date(new Date().toUTCString()))}.csv`);
        } catch (error) {
            console.error(error);
        }
    });
}

async function Setup() {
    // Create directories
    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    await mkdir(ARCHIVE_DIRECTORY, { recursive: true });
    await mkdir(TOKEN_DIRECTORY, { recursive: true });

    // Load any existing Refresh Token and if available use that to get a new Access Token.
    // TODO: Otherwise send an email to the user asking them to authenticate using the /auth endpoint.
    try {
        const data = await readFile(`${TOKEN_DIRECTORY}/${TOKEN_FILE}`, 'utf-8');
    
        REFRESH_TOKEN = data;
        console.log(`Existing refresh token found: ${REFRESH_TOKEN}`);
        await RefreshAccessToken(CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN);
    
    } catch (err) {
        console.error(err);
    }
}