# Monzo Data Exporter

A simple node.js webserver which can be used to download transactions from a Monzo bank account or export them as a CSV.

I created this to be used in conjuction with the great [Firefly III](https://github.com/firefly-iii/firefly-iii) application (or more specifically the Firefly III Data Importer companion app) to be able to automate the process of extracting transaction data from Monzo and importing it into Firefly III. However you can use this as you wish, it provides REST endpoints for getting transactions as JSON or an endpoint for trigging a csv to be generated.

# Getting Started
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

Run the webserver
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
To grant the application access to your Monzo account you will first need to havigate to the `/auth` endpoint (i.e. `http://localhost:8080/auth` if running locally). This will trigger the OAuth2 user flow and get you to authorize access.

### Persisting Authorisation
If you wish to persist the authorisation between restarts of the application you can set the `TOKEN_FILE` configuration option to  a filenme which the application will use to write the refresh token it receives to. This will be used retrieve a new access token when the application restarts. Otherwise you'll need to repeat the connecting to Monzo step each time the application starts.

Note: Due to *Strong Customer Authentication* changes implemented by Monzo you are only able to fetch all transactions within the first 5 minutes after authentication. After this 5 minute period you'll only be able to fetch transactions within the last 90 days. *(Failing to enter a valid `since` date as a query parameter on the `/transactions` and `/export/transactions` will result in a HTTP 403 (Unauthorised) error).*

## How to Use

# Building
## Docker
A Dockerfile has been included should you wish to build your own image.

To build, run the following command from the project's root directory:
```
docker build . -t <image name>
```
Alternatively to build for multiple platforms (i.e. arm64 if you wish to run this on something like a Raspberry Pi):
```
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 -t <image name> --push .