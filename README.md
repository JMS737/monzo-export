# Monzo Data Exporter

A simple node.js webserver which can be used to download transactions from a Monzo bank account or export them as a CSV.

I created this to be used in conjuction with the great [Firefly III](https://github.com/firefly-iii/firefly-iii) application (or more specifically the Firefly III Data Importer companion app) to be able to automate the process of extracting transaction data from Monzo and importing it into Firefly III. However you can use this as you wish, it provides REST endpoints for getting transactions as JSON or an endpoint for trigging a csv to be generated.

## Installation
### Self Hosted
Ensure `node` and `npm` are installed on the target system.

Clone the git repos somewhere and install dependencies.
``` sh
> git clone https://github.com/JMS737/monzo-export.git
> cd monzo-export
> npm install
```

Setup the necessary configuration (see Configuration).

Run the webserver using one of the following commands.
``` sh
> npm run start
# or
> node src/app.js
```

### Docker Compose
Check out the example [docker-compose](https://github.com/JMS737/monzo-export/blob/main/examples/docker-compose.yml) file to quickly get the application up and running. Configuration values can be provided using the `env_file` option or by setting them in the `environment` section of the docker-compose.yml file.

## Configuration
### Environment
All configuration is handled via environment variables which can be set either on the operating system or via a .env file. See the example [here](https://github.com/JMS737/monzo-export/blob/main/examples/.env) to view what options are available along with the default values. If you're using the docker image the environment variables can also set via the CLI or the docker-compose.yml file.

### Connecting to Monzo
First we need to set up a client within the Monzo Developer Portal, so head over to https://developers.monzo.com/ and follow the instructions to sign in. Once you're in navigate to the **Clients** page using the link in the top right and click the **+ New OAuth Client** button. Next fill out the details like so:

|Value|Setting|
|-|-|
| Name | Give the client a name which be displayed within the Monzo app when asking for approval. |
| Logo URL | Provide the URL to a logo if you wish but this isn't required. |
| Redirect URLs | This must be set to the callback endpoint for the application i.e. `http://<base address>/auth/callback` where the base address is the URL you're using to connect to the webserver. <br>Some examples:<ul><li>http://localhost/auth/callback</li><li>https://my-server.local:8080/auth/callback</li><li>https://monzo.example.com/auth/callback</li></ul>
| Description | A description to help identify the application in approval requests.
| Confidentiality | Set this to 'Confidential'.

Once finished, click the **Submit** button and take a note of the `Client ID` and `Client Secret` on the newly created client. You'll want to set these values in the `CLIENT_ID` and `CLIENT_SECRET` configuration variables, either via environment variables or the .env file as mentioned in the [Environment](#environment) section. Also, set the `REDIRECT_URI` to the same one you used when creating the client.

To grant the application access to your Monzo account you will first need to havigate to the `/auth` endpoint (i.e. `http://localhost:8080/auth` if running locally). This will trigger the OAuth2 user flow and get you to authorize access.

### Persisting Authorisation
If you wish to persist the authorisation between restarts of the application you can set the `TOKEN_FILE` configuration option to a filenme which the application will use to save the refresh token it receives. This will be read in autoamatically if it exists when the application restarts and used to obtain a new access token (assuming the refresh token is still valid). Otherwise you'll need to repeat the connecting to Monzo step each time the application starts.

## Endpoints
### Who Am I
#### Request
`GET /whoami`
``` bash
curl -i -H 'Accept: application/json' http://localhost:8080/whoami
```
#### Response
```
HTTP/1.1 200 OK
Content-Type: application/json
Date: Sat, 19 Nov 2022 22:18:58 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

{
    "authenticated":true,
    "client_id":"<your client id>",
    "user_id":"<your user id>"
}
```
### Accounts
#### Request
`GET /accounts`
``` bash
curl -i -H 'Accept: application/json' http://localhost:8080/accounts
```
#### Response
```
HTTP/1.1 200 OK
Content-Type: application/json
Date: Sat, 19 Nov 2022 22:22:04 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

{
    "accounts":[
        {
            "id":"acc_0000000000000000000000",
            "closed":false,
            "created":"2022-11-19T14:00:00.000Z",
            "description":"user_0000000000000000000000",
            "type":"uk_retail",
            "currency":"GBP",
            "country_code":"GB",
            "owners":[
                {
                    "user_id":"user_0000000000000000000000",
                    "preferred_name":"Foo Bar",
                    "preferred_first_name":"Foo"
                }
            ],
            "account_number":"01234567",
            "sort_code":"012345",
            "payment_details": {
                "locale_uk": {
                    "account_number":"01234567",
                    "sort_code":"012345"
                }
            }
        }
    ]
}
```
### Transactions (JSON)
#### Request
`/GET /transactions`

Optional Date Parameter `since` (only fetches transactions on and after that date).
``` bash
curl -i -H 'Accept: application/json' http://localhost:8080/transactions?since=2022-01-31T00:00:00.000Z
```
#### Response
This is only a sample transaction, not all fields are shown here. See https://docs.monzo.com/#transactions for more details.

```
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json
Date: Sat, 19 Nov 2022 22:40:13 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

[
    {
        "amount": -510,
        "created": "2015-08-22T12:20:18Z",
        "currency": "GBP",
        "description": "THE DE BEAUVOIR DELI C LONDON        GBR",
        "id": "tx_00008zIcpb1TB4yeIFXMzx",
        "merchant": "merch_00008zIcpbAKe8shBxXUtl",
        "metadata": {},
        "notes": "Salmon sandwich 🍞",
        "is_load": false,
        "settled": "2015-08-23T12:20:18Z",
        "category": "eating_out"
    },
    {
        "amount": -679,
        "created": "2015-08-23T16:15:03Z",
        "currency": "GBP",
        "description": "VUE BSL LTD            ISLINGTON     GBR",
        "id": "tx_00008zL2INM3xZ41THuRF3",
        "merchant": "merch_00008z6uFVhVBcaZzSQwCX",
        "metadata": {},
        "notes": "",
        "is_load": false,
        "settled": "2015-08-24T16:15:03Z",
        "category": "eating_out"
    },
]
```

### Transactions (CSV Export)
Calling either of these endpoints will trigger the generation of a CSV containing the all transactions after the provided `since` parameter, or all transactions if this is omitted **(see [Limitations and Caveats](#limitations-and-caveats) to get transactions older than 90 days).**

Where the CSV is output can be configured with the `OUTPUT_DIRECTORY` and `OUTPUT_FILENAME` configuration values. By default it will be `./output/export.csv`.

#### Requests
`/GET /export/transactions`

Optional Date Parameter `since` (only fetches transactions on and after that date).
```
curl -i -H 'Accept: application/json' http://localhost:8080/export/transactions?since=2022-01-31T00:00:00.000Z
```

`/GET /export/transactions/latest`

Shorthand for returning all transactions within the last month.
```
curl -i -H 'Accept: application/json' http://localhost:8080/export/transactions/latest
```

#### Response
```
HTTP/1.1 200 OK
Content-Type: application/json
Date: Sat, 19 Nov 2022 22:37:56 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

{"success":true}
```

#### Sample CSV Output
``` csv
account_id,id,date,time,type,merchant,counterparty_account,category,amount,currency,notes,description
acc_0000000000000000000000,tx_00008zIcpb1TB4yeIFXMzx,2015/08/22,07:52:27,mastercard,The De Beauvoir Deli Co.,,eating_out,-5.10,GBP,Salmon sandwich 🍞,THE DE BEAUVOIR DELI C LONDON        GBR London GBR
acc_0000000000000000000000,tx_00008zL2INM3xZ41THuRF3,2015/08/23,07:01:34,payport_faster_payments,,01234567,transfers,-100,GBP,Moving money to savings account.,Savings Deposit
```

## Building
### Docker
A Dockerfile has been included should you wish to build your own image.

To build, run the following command from the project's root directory:
```
docker build . -t <image name>
```
Alternatively to build for multiple platforms (i.e. arm64 if you wish to run this on something like a Raspberry Pi):
```
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 -t <image name> --push .
```

## Limitations and Caveats
### Retrieving transactions older than 90 days
Due to *Strong Customer Authentication* changes implemented by Monzo you are only able to fetch all transactions within the first 5 minutes after authentication. After this 5 minute period you'll only be able to fetch transactions within the last 90 days. *(Failing to enter a valid `since` date as a query parameter on the `/transactions` and `/export/transactions` endpoints will result in a HTTP 403 (Unauthorised) error).*