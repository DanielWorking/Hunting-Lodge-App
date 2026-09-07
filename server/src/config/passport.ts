/**
 * @module Config/Passport
 *
 * Compatibility adapter providing SSO / OIDC authentication and session settings
 * for Passport-compatible consumers.
 */

import "./env";
import { deepFreeze } from "./env";
import ssoConfig from "./sso";
import type { PassportConfig, SsoConfig } from "../types/config";

const rawPassportConfig: PassportConfig = {
    issuerUrl: ssoConfig.issuerUrl,
    clientId: ssoConfig.clientId,
    clientSecret: ssoConfig.clientSecret,
    redirectUri: ssoConfig.redirectUri,
    identifierField: ssoConfig.identifierField,
    scope: ssoConfig.scope,
    session: false,
};

type ExportedPassportConfig = PassportConfig & {
    readonly default: PassportConfig;
    readonly passportConfig: PassportConfig;
    readonly ssoConfig: SsoConfig;
};

const combinedPassport: ExportedPassportConfig = {
    ...rawPassportConfig,
    default: rawPassportConfig,
    passportConfig: rawPassportConfig,
    ssoConfig: rawPassportConfig,
};

const exportedPassport: ExportedPassportConfig = deepFreeze(combinedPassport);

export = exportedPassport;
