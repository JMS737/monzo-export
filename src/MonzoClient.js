import axios from "axios";
import { writeFile, readFile, mkdir } from "fs/promises";

export default class MonzoClient {
    #CLIENT_ID = process.env.CLIENT_ID;
    #CLIENT_SECRET = process.env.CLIENT_SECRET;
    STATE = process.env.STATE;
    #MONZO_AUTH_ENDPOINT = process.env.MONZO_AUTH_ENDPOINT;
    #MONZO_TOKEN_PATH = process.env.MONZO_TOKEN_PATH;
    #MONZO_API_ENDPOINT = process.env.MONZO_API_ENDPOINT;
    #REDIRECT_PATH = process.env.REDIRECT_PATH;
    #REDIRECT_URI;
    #TOKEN_FILE = process.env.TOKEN_FILE;
    #TOKEN_DIRECTORY = process.env.TOKEN_DIRECTORY;

    // Session Values
    #ACCESS_TOKEN = undefined;
    #REFRESH_TOKEN = undefined;
    #USER_ID = undefined;

    constructor(host) {
        if (this.#REDIRECT_PATH[0] == "/") {
            this.#REDIRECT_URI = `${host}${this.#REDIRECT_PATH}`;
        } else {
            this.#REDIRECT_URI = `${host}/${this.#REDIRECT_PATH}`;
        }
        console.log(`Redirect URI: ${this.#REDIRECT_URI}`);
    }

    async Init() {
        await mkdir(this.#TOKEN_DIRECTORY, { recursive: true });

        // Load any existing Refresh Token and if available use that to get a new Access Token.
        // TODO: Otherwise send an email to the user asking them to authenticate using the /auth endpoint.
        try {
            const data = await readFile(`${this.#TOKEN_DIRECTORY}/${this.#TOKEN_FILE}`, 'utf-8');

            this.#REFRESH_TOKEN = data;
            console.log(`Existing refresh token found: ${this.#REFRESH_TOKEN}`);
            await this.RefreshAccessToken(this.#REFRESH_TOKEN);

        } catch (err) {
            console.error(err);
        }

    }

    //#region Authorization

    Authorize(res) {
        res.redirect(`${this.#MONZO_AUTH_ENDPOINT}/?client_id=${this.#CLIENT_ID}&redirect_uri=${this.#REDIRECT_URI}&response_type=code&state=${this.STATE}`);
    }

    async GetAccessToken(authCode, state) {
        const data = new URLSearchParams({
            grant_type: "authorization_code",
            client_id: this.#CLIENT_ID,
            client_secret: this.#CLIENT_SECRET,
            redirect_uri: this.#REDIRECT_URI,
            code: authCode
        }).toString();

        console.log(`Getting new access token. Sending request: ${this.#MONZO_API_ENDPOINT}${this.#MONZO_TOKEN_PATH}; Body: ${data}`);

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

        console.log(`Refreshing access token. Sending request: ${this.#MONZO_API_ENDPOINT}${this.#MONZO_TOKEN_PATH}; Body: ${data}`);

        try {
            const response = await axios.post(`${this.#MONZO_API_ENDPOINT}${this.#MONZO_TOKEN_PATH}`, data);
            this.StoreToken(response.data.access_token, response.data.refresh_token, response.data.user_id);

        } catch (error) {
            console.error(error);
        }
    }

    async StoreToken(access_token, refresh_token, user_id) {
        this.#ACCESS_TOKEN = access_token;
        this.#REFRESH_TOKEN = refresh_token;
        this.#USER_ID = user_id;

        try {
            await writeFile(`${this.#TOKEN_DIRECTORY}/${this.#TOKEN_FILE}`, this.#REFRESH_TOKEN);
        } catch (error) {
            console.error(error);
            return;
        }

        console.log(`Sucessfully stored access tokens:`);
        console.log(`Access Token: ${this.#ACCESS_TOKEN}`);
        console.log(`Refresh Token: ${this.#REFRESH_TOKEN}`);
        console.log(`User ID: ${this.#USER_ID}`);
    }

    //#endregion

    async WhoAmI() {
        console.log('Pinging /whoami endpoint.');
        try {
            const response = await axios.get(`${this.#MONZO_API_ENDPOINT}/ping/whoami`, { headers: { Authorization: `Bearer ${this.#ACCESS_TOKEN}` } })
            // console.log(response.data);
            return response.data;
        } catch (error) {
            console.error('Failed to call /whoami endpoint.');
            // console.error(error);
        }
    }

    async GetTransactions(since) {
        const account = await this.GetAccount();
        return await this.GetTransactionsForAccount(account, since);
    }

    async GetTransactionsForAccount(account_id, since) {
        try {
            const params = {
                account_id: account_id
            };

            if (since != undefined) {
                params.since = since;
            }

            const qs = new URLSearchParams(params).toString();
            const response = await axios.get(`${this.#MONZO_API_ENDPOINT}/transactions?expand[]=merchant&${qs}`, {
                headers: {
                    Authorization: `Bearer ${this.#ACCESS_TOKEN}`
                }
            });
            // console.log(response.data);
            return response.data
        } catch (error) {
            console.error('Failed to get transactions.');
            console.error(error);
        }
    }

    async GetAccount() {
        try {
            const response = await axios.get(`${this.#MONZO_API_ENDPOINT}/accounts/`, { headers: { Authorization: `Bearer ${this.#ACCESS_TOKEN}` } });
            // console.log(response.data);
            return response.data.accounts[0].id;
        } catch (error) {
            console.error('Failed to get account.');
            // console.error(error);
        }
    }

    async GetAccounts() {
        try {
            const response = await axios.get(`${this.#MONZO_API_ENDPOINT}/accounts/`, { headers: { Authorization: `Bearer ${this.#ACCESS_TOKEN}` } });
            // console.log(response.data);
            return response.data;
        } catch (error) {
            console.error('Failed to get accounts.');
            // console.error(error);
        }
    }
}