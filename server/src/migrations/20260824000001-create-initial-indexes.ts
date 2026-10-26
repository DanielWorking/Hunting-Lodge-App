/**
 * Migration: Create Initial Indexes
 *
 * Creates exactly the indexes the Mongoose schemas declare. Preprod and prod run with autoIndex
 * off, so this migration is how their indexes are built:
 * - users: unique username, unique email, unique SSO identity (issuer + subject, when both are set),
 *   and groups.groupId
 * - groups: unique name
 * - shiftschedules: unique (groupId + startDate) and published-range lookups
 * - sites: (groupId + tag), (groupId + url)
 * - shiftreports: unique (groupId + title), (groupId + date + startTime) and keyset pagination (groupId + date + _id)
 * - phones: numbers, name
 */

import { Db, MongoClient, IndexSpecification, CreateIndexesOptions, MongoServerError } from "mongodb";

interface IndexDefinition {
    readonly collection: string;
    readonly keys: IndexSpecification;
    readonly options?: CreateIndexesOptions;
}

export const INDEXES: ReadonlyArray<IndexDefinition> = [
    { collection: "users", keys: { username: 1 }, options: { unique: true } },
    { collection: "users", keys: { email: 1 }, options: { unique: true } },
    { collection: "users", keys: { "groups.groupId": 1 } },
    {
        collection: "users",
        keys: { ssoIssuer: 1, ssoSubject: 1 },
        options: {
            unique: true,
            partialFilterExpression: {
                ssoIssuer: { $type: "string", $gt: "" },
                ssoSubject: { $type: "string", $gt: "" },
            },
        },
    },

    { collection: "groups", keys: { name: 1 }, options: { unique: true } },

    { collection: "shiftschedules", keys: { groupId: 1, startDate: 1 }, options: { unique: true } },
    { collection: "shiftschedules", keys: { groupId: 1, isPublished: 1, startDate: 1, endDate: 1 } },

    { collection: "sites", keys: { groupId: 1, tag: 1 } },
    { collection: "sites", keys: { groupId: 1, url: 1 } },

    { collection: "shiftreports", keys: { groupId: 1, title: 1 }, options: { unique: true } },
    { collection: "shiftreports", keys: { groupId: 1, date: -1, startTime: -1 } },
    { collection: "shiftreports", keys: { groupId: 1, date: -1, _id: -1 } },

    { collection: "phones", keys: { numbers: 1 } },
    { collection: "phones", keys: { name: 1 } },
];

export async function up(db: Db, _client?: MongoClient): Promise<void> {
    // createIndex is a no-op for an identical existing index (e.g. one built by autoIndex in nonprod)
    for (const { collection, keys, options } of INDEXES) {
        await db.collection(collection).createIndex(keys, options ?? {});
    }
}

export async function down(db: Db, _client?: MongoClient): Promise<void> {
    for (const { collection, keys } of INDEXES) {
        try {
            await db.collection(collection).dropIndex(keys as unknown as string);
        } catch (err: unknown) {
            // An index that was never created (or already dropped) is not an error on rollback
            if (err instanceof MongoServerError && (err.code === 27 || err.codeName === "IndexNotFound")) {
                continue;
            }
            throw err;
        }
    }
}

export default { up, down };
