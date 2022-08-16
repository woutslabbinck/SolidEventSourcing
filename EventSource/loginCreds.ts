import {readdirSync, readFileSync, writeFileSync} from "fs";
import {Session, ILoginInputOptions, InMemoryStorage} from "@rubensworks/solid-client-authn-isomorphic";

import {config} from 'dotenv';
const express = require("express");

const {ArgumentParser} = require('argparse');

const parser = new ArgumentParser({
    description: 'Logincreds'
});

parser.add_argument('-i', '--idpprovider', {help: 'url of idp provider', default: 'http://localhost:3000/'});

const args = parser.parse_args()

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

config();

export enum RegistrationType {
    Static = "static",
    Dynamic = "dynamic"
};

type InputOptions = {
    solidIdentityProvider: string;
    applicationName?: string;
    registrationType: RegistrationType; // not used?
};

export async function login(validatedOptions: InputOptions): Promise<void> {
    const app = express();
    const port = 3123;
    const iriBase = `http://localhost:${port}`;
    const storage = new InMemoryStorage();

    const session: Session = new Session({
        insecureStorage: storage,
        secureStorage: storage,
    });

    const server = app.listen(port, async () => {
        console.log(`Listening at: [${iriBase}].`);
        const loginOptions: ILoginInputOptions = {
            clientName: validatedOptions.applicationName,
            oidcIssuer: validatedOptions.solidIdentityProvider,
            redirectUrl: iriBase,
            tokenType: "DPoP",
            handleRedirect: (url: string) => {
                console.log(`\nPlease visit ${url} in a web browser.\n`);
            },
        };
        console.log(
            `Logging in to Solid Identity Provider  ${validatedOptions.solidIdentityProvider} to get a refresh token.`
        );

        session.login(loginOptions).catch((e) => {
            throw new Error(
                `Logging in to Solid Identity Provider [${validatedOptions.solidIdentityProvider
                }] failed: ${e.toString()}`
            );
        });
    });

    app.get("/", async (_req: {url: string | URL;}, res: {send: (arg0: string) => void;}) => {
        const redirectIri = new URL(_req.url.toString(), iriBase).href;
        console.log(
            `Login into the Identity Provider successful, receiving request to redirect IRI [${redirectIri}].`
        );
        await session.handleIncomingRedirect(redirectIri);
        // NB: This is a temporary approach, and we have work planned to properly
        // collect the token. Please note that the next line is not part of the public
        // API, and is therefore likely to break on non-major changes.
        const rawStoredSession = await storage.get(
            `solidClientAuthenticationUser:${session.info.sessionId}`
        );
        if (rawStoredSession === undefined) {
            throw new Error(
                `Cannot find session with ID [${session.info.sessionId}] in storage.`
            );
        }
        const storedSession = JSON.parse(rawStoredSession);
        console.log(`
These are your login credentials:
{
  "refreshToken" : "${storedSession.refreshToken}",
  "clientId"     : "${storedSession.clientId}",
  "clientSecret" : "${storedSession.clientSecret}",
  "issuer"       : "${storedSession.issuer}",
}
`);
        res.send(
            "The tokens have been sent to @inrupt/generate-oidc-token. You can close this window."
        );

        // write session away
        writeFileSync("config.json", JSON.stringify(storedSession));

        server.close((err) => {
            process.exit(err ? 1 : 0);
        });
    });
}

/**
 * Function only stops when a config file is created -> indicating that a user is logged in
 */
export async function isLoggedin(): Promise<void> {
    const rootPath = ".";
    let loggedIn = false;
    while (!loggedIn) {
        const files = readdirSync(rootPath);
        if (files.includes('config.json')) {
            loggedIn = true;
            break;
        }
        await sleep(1000);
    }
}

export async function getSession(): Promise<Session> {
    const configPath = 'config.json';
    const credentials = JSON.parse(readFileSync(configPath, 'utf-8'));

    const session = new Session();
    session.onNewRefreshToken((newToken: string): void => {
        console.log("New refresh token: ", newToken);
    });
    await session.login({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        refreshToken: credentials.refreshToken,
        oidcIssuer: credentials.issuer,
    });
    // unlinkSync(configPath);
    return session;
}

async function loginAndWriteCreds() {
    const validatedOptions = {
        applicationName: "LDES-orchestrator",
        registrationType: RegistrationType.Dynamic,
        solidIdentityProvider: args['idpprovider']
    };
    await login(validatedOptions);
    await isLoggedin();
}
loginAndWriteCreds()

