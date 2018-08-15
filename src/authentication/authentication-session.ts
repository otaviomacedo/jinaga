import { Feed, Observable } from '../feed/feed';
import { LoginResponse } from '../http/messages';
import { Keystore, UserIdentity } from '../keystore';
import { Query } from '../query/query';
import { FactRecord, FactReference } from '../storage';
import { Authentication } from './authentication';

export class AuthenticationSession implements Authentication {
    constructor(
        private inner: Feed,
        private keystore: Keystore,
        private userIdentity: UserIdentity,
        private displayName: string
    ) {}

    async login(): Promise<LoginResponse> {
        const userFact = await this.keystore.getUserFact(this.userIdentity);
        return {
            userFact,
            profile: {
                displayName: this.displayName
            }
        };
    }

    from(fact: FactReference, query: Query): Observable {
        return this.inner.from(fact, query);
    }

    save(facts: FactRecord[]): Promise<FactRecord[]> {
        return this.inner.save(facts);
    }

    query(start: FactReference, query: Query): Promise<FactReference[][]> {
        return this.inner.query(start, query);
    }

    load(references: FactReference[]): Promise<FactRecord[]> {
        return this.inner.load(references);
    }
}