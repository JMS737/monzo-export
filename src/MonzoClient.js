import axios from "axios";
import {writeFile, readFile, mkdir} from "fs/promises";
import {v4 as uuidv4} from "uuid";

/* TODO:
- [ ] Send an email notifying the user that the service needs to be reauthenticated.
*/

export default class MonzoClient {
    #CLIENT_ID = process.env.CLIENT_ID;
    #CLIENT_SECRET = process.env.CLIENT_SECRET;
    #STATE;
    #MONZO_AUTH_ENDPOINT = process.env.MONZO_AUTH_ENDPOINT;
    #MONZO_TOKEN_PATH = process.env.MONZO_TOKEN_PATH;
    #MONZO_API_ENDPOINT = process.env.MONZO_API_ENDPOINT;
    #REDIRECT_URI = process.env.REDIRECT_URI
    #TOKEN_FILE = process.env.TOKEN_FILE;
    #TOKEN_DIRECTORY = process.env.TOKEN_DIRECTORY;

    // Session Values
    #ACCESS_TOKEN = undefined;
    #REFRESH_TOKEN = undefined;
    #USER_ID = undefined;

    constructor() {

    }

    async Init() {
        await mkdir(this.#TOKEN_DIRECTORY, {recursive: true});

        // Load any existing Refresh Token and if available use that to get a new Access Token.
        // TODO: Otherwise send an email to the user asking them to authenticate using the /auth endpoint.
        if (this.#TOKEN_FILE != undefined && this.#TOKEN_FILE != null && this.#TOKEN_FILE != "") {
            try {
                const data = await readFile(`${this.#TOKEN_DIRECTORY}/${this.#TOKEN_FILE}`, 'utf-8');
                if (data == undefined || data == "" || data == null) {
                    return;
                }
                this.#REFRESH_TOKEN = data;
                console.log('Existing refresh token found. Attempting to get access token.');
                await this.RefreshAccessToken(this.#REFRESH_TOKEN);

            } catch (err) {
                console.error(err);
            }
        }
    }

    //#region Authorization

    Authorize(res) {
        this.#STATE = new uuidv4();
        res.redirect(`${this.#MONZO_AUTH_ENDPOINT}/?client_id=${this.#CLIENT_ID}&redirect_uri=${this.#REDIRECT_URI}&response_type=code&state=${this.#STATE}`);
    }

    async GetAccessToken(authCode, state) {
        if (state != this.#STATE) {
            throw new Error("State did not match.");
        }

        const data = new URLSearchParams({
            grant_type: "authorization_code",
            client_id: this.#CLIENT_ID,
            client_secret: this.#CLIENT_SECRET,
            redirect_uri: this.#REDIRECT_URI,
            code: authCode
        }).toString();

        console.log('Requesting new access token...');

        try {
            const response = await axios.post(`${this.#MONZO_API_ENDPOINT}${this.#MONZO_TOKEN_PATH}`, data);
            this.StoreToken(response.data.access_token, response.data.refresh_token, response.data.user_id);
        } catch (error) {
            console.error(error);
        }
    }

    async RefreshAccessToken(refresh_token) {
        const data = new URLSearchParams({
            grant_type: "refresh_token",
            client_id: this.#CLIENT_ID,
            client_secret: this.#CLIENT_SECRET,
            refresh_token: refresh_token
        }).toString();

        console.log('Refreshing access token...');

        try {
            const response = await axios.post(`${this.#MONZO_API_ENDPOINT}${this.#MONZO_TOKEN_PATH}`, data);
            await this.StoreToken(response.data.access_token, response.data.refresh_token, response.data.user_id);

        } catch (error) {
            console.error(error);
        }
    }

    async StoreToken(access_token, refresh_token, user_id) {
        this.#ACCESS_TOKEN = access_token;
        this.#REFRESH_TOKEN = refresh_token;
        this.#USER_ID = user_id;

        // Only store the tokens if hte TOKEN_FILE configuration value has been set.
        if (this.#TOKEN_FILE != undefined && this.#TOKEN_FILE != null && this.#TOKEN_FILE != "") {
            try {
                await writeFile(`${this.#TOKEN_DIRECTORY}/${this.#TOKEN_FILE}`, this.#REFRESH_TOKEN);
            } catch (error) {
                console.error(error);
                return;
            }
        }

        console.log(`Successfully stored access tokens.`);
    }

    //#endregion

    async WhoAmI() {
        console.log('Pinging /whoami endpoint.');
        try {
            const response = await this.#Request('get', `${this.#MONZO_API_ENDPOINT}/ping/whoami`);
            // console.log(response.data);
            return response.data;
        } catch (error) {
            console.error('Failed to call /whoami endpoint.');
            // console.error(error);
        }
    }

    async GetTransactions(since, includePending = true, includeDeclined = false) {
        const accounts = await this.GetAccounts();
        return (await Promise.all(accounts.accounts.map(async account => await this.GetTransactionsForAccount(account.id, since))))
            .flatMap(x => x.transactions)
            .filter(value => includePending || value.amount_is_pending !== true)
            .filter(value => includeDeclined || !value.decline_reason);
    }

    async GetTransactionsForAccount(account_id, since, limit = 100) {
        try {
            const params = {
                account_id: account_id,
                limit: limit
            };

            // default since to one month's worth of transactions
            if (since === undefined) {
                const date = new Date();
                date.setMonth(date.getMonth() - 1);
                date.setHours(0, 0, 0, 0);
                since = date.toISOString();
            }
            
            let sinceDate = new Date(since);
            let beforeDate = new Date(sinceDate);
            beforeDate.setFullYear(beforeDate.getFullYear() + 1);
            beforeDate = new Date(beforeDate - 1000 * 60 * 60 * 24);
            let sinceId = null;

            let transactions = [];

            // keep looping over pages whilst there is still data being returned
            while (true) {
                params.before = beforeDate.toISOString();
                
                if (sinceId == null) {
                    params.since = sinceDate.toISOString();
                } else {
                    params.since = sinceId
                }
                
                const qs = new URLSearchParams(params).toString();
                const response = await this.#Request('get', `${this.#MONZO_API_ENDPOINT}/transactions?expand[]=merchant&${qs}`);
                transactions = transactions.concat(response.data.transactions);
                
                const len = response.data.transactions.length;
                if (len < 100 && beforeDate > new Date()) {
                    break;
                }
                
                if (len === 0) {
                    // skip to the next year
                    sinceDate.setFullYear(sinceDate.getFullYear() + 1);
                    beforeDate.setFullYear(beforeDate.getFullYear() + 1);
                    sinceId = null;
                    continue;
                }

                sinceId = response.data.transactions[len - 1].id;
                
                // update pagination based on the latest transaction received
                // update the dates in case they need to be used where there are no transactions within the year
                sinceDate = new Date(response.data.transactions[len - 1].created);
                beforeDate = new Date(sinceDate)
                beforeDate.setFullYear(beforeDate.getFullYear() + 1)
                beforeDate = new Date(beforeDate - 1000 * 60 * 60 * 24);
            }
            return {transactions: transactions};
        } catch (error) {
            console.error('Failed to get transactions.');
            console.error(error);
        }
    }

    async GetAccount() {
        try {
            const response = await this.#Request('get', `${this.#MONZO_API_ENDPOINT}/accounts/`);
            return response.data.accounts[0].id;
        } catch (error) {
            console.error('Failed to get account.');
            // console.error(error);
        }
    }

    async GetAccounts() {
        try {
            // const response = await axios.get(`${this.#MONZO_API_ENDPOINT}/accounts/`, { headers: { Authorization: `Bearer ${this.#ACCESS_TOKEN}` } });
            const response = await this.#Request('get', `${this.#MONZO_API_ENDPOINT}/accounts/`)
            // console.log(response.data);
            return response.data;
        } catch (error) {
            console.error('Failed to get accounts.');
            // console.error(error);
        }
    }

    async #Request(method, url, data, isRetry) {
        console.debug(`Sending ${method} request to '${url}'`);
        try {
            return await axios({
                method: method,
                url: url,
                data: data,
                headers: {Authorization: `Bearer ${this.#ACCESS_TOKEN}`}
            })
        } catch (error) {
            console.error(`Monzo Client request failed with status code ${error.response?.status}. ${error}`)
            // Only attempt to re-authenticate once, if this fails it's likely the refresh token is no longer valid and the user must
            // re-authenticate using the /auth endpoint.
            if ((error.response?.status === 401 || error.response?.status === 403) && !isRetry) {
                try {
                    console.error('Request failed with "Unauthorised" status code. Attempting to refresh access token...');
                    await this.RefreshAccessToken(this.#REFRESH_TOKEN);
                } catch (error) {
                    // TODO: Email user to re-authenticate.
                    return
                }

                return await this.#Request(method, url, data, true);
            } else {
                throw error;
            }
        }
    }
}