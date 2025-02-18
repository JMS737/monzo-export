// Load .env values into process.env
import dotenv from "dotenv";

dotenv.config();

// Import required libraries.
import express from "express";
import {writeFile, copyFile, mkdir} from 'fs/promises';
import {parse} from 'url';
import {stringify} from 'csv-stringify';
import format from 'date-format';
import MonzoClient from "./MonzoClient.js";

const hostname = process.env.HOSTNAME;
const port = Number(process.env.PORT);
const server = express();
const includeTime = process.env.INCLUDE_TIME?.toLowerCase() === "true";
const includeLocalCurrency = process.env.INCLUDE_LOCAL_CURRENCY?.toLowerCase() === "true";

if (includeTime) {
    console.log("Time export enabled.");
}

if (includeLocalCurrency) {
    console.log("Local currency export enabled");
}

const OUTPUT_FILENAME = process.env.OUTPUT_FILENAME

// Authorization Values

const OUTPUT_DIRECTORY = process.env.OUTPUT_DIRECTORY;
const ARCHIVE_DIRECTORY = process.env.ARCHIVE_DIRECTORY;

const client = new MonzoClient();

await Setup();

server.get('/', (req, res) => {
    res.status(200).send('Hello world');
});

server.get('/auth', (req, res) => {
    client.Authorize(res);
});

server.get('/auth/callback', async (req, res) => {
    const queryObject = parse(req.url, true).query;
    // console.log(queryObject);

    const code = queryObject.code;
    const state = queryObject.state;

    try {
        client.GetAccessToken(code, state);
    } catch (error) {
        return res.status(400).send(error.message);
    }

    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('Try adding some query parameters to the end of the url.');
    // res.send('Try adding some query parameters to the end of the url.');
})

server.get('/whoami', async (req, res) => {
    const data = await client.WhoAmI();
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(data));
})

server.get('/accounts', async (req, res) => {
    const data = await client.GetAccounts();
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(data));
})

server.get('/transactions', async (req, res) => {
    const queryObject = parse(req.url, true).query;
    const data = await client.GetTransactions(queryObject.since, queryObject.pending !== "false", queryObject.declined === "true");

    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(data));
})

server.get('/transactions/latest', async (req, res) => {
    const queryObject = parse(req.url, true).query;
    const date = new Date();
    date.setDate(date.getDate() - 5);
    date.setHours(0, 0, 0, 0);
    const since = date.toISOString();

    const data = await client.GetTransactions(since, queryObject.pending !== "false", queryObject.declined === "true");
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(data));
})

server.get('/export/transactions', async (req, res) => {
    const queryObject = parse(req.url, true).query;
    const data = await client.GetTransactions(queryObject.since, queryObject.pending !== "false", queryObject.declined === "true");
    TransactionsToCsv(TransformTransactions(data));

    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({success: true}));
})

server.get('/export/transactions/latest', async (req, res) => {
    const queryObject = parse(req.url, true).query;
    const date = new Date();
    date.setDate(date.getDate() - 5);
    date.setHours(0, 0, 0, 0);
    const since = date.toISOString();
    console.log(since);

    const data = await client.GetTransactions(since, queryObject.pending !== "false", queryObject.declined === "true");
    TransactionsToCsv(TransformTransactions(data));

    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({success: true}));
})

server.listen(port, hostname, () => {
    console.log(`Server is running at http://${hostname}:${port}/`);
});

function TransformTransactions(transactions) {
    return transactions.map((transaction) => {
        const createdDate = new Date(transaction.created);
        const regex = /\s+/g
        const row = {
            account_id: transaction.account_id,
            id: transaction.id,
            date: format(includeTime ? "yyyy/MM/dd hh:mm:ss" : "yyyy/MM/dd", createdDate),
            time: format("hh:mm:ss", createdDate),
            type: transaction.scheme,
            merchant: transaction.merchant?.name,
            counterparty_account: transaction.counterparty?.account_number,
            category: transaction.category,
            amount: transaction.amount / 100,
            currency: transaction.currency,
            notes: transaction.notes,
            description: transaction.description.replace(regex, ' ')
        };

        if (includeLocalCurrency) {
            row.local_amount = transaction.local_amount / 100;
            row.local_currency = transaction.local_currency;
        }

        return row;
    });
}

function TransactionsToCsv(transactions) {
    console.log("Converting to csv");
    stringify(transactions, {header: true}, async (err, output) => {
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
    await mkdir(OUTPUT_DIRECTORY, {recursive: true});
    await mkdir(ARCHIVE_DIRECTORY, {recursive: true});

    await client.Init();
}