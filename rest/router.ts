import express, { Handler, Request } from 'express';

import { Authorization } from '../authorization';
import { LoginResponse, ProfileMessage } from './messages';

function get(method: ((req: Request) => Promise<{}>)): Handler {
    return (req, res, next) => {
        method(req)
            .then(response => {
                res.send(response);
                next();
            })
            .catch(error => {
                console.error(error);
                res.sendStatus(500);
                next();
            });
    };
}

export interface UserIdentity {
    provider: string;
    id: string;
    profile: ProfileMessage;
}

export class HttpRouter {
    handler: Handler;

    constructor(authorization: Authorization) {
        const router = express.Router();
        router.get('/login', get(this.login));
        this.handler = router;
    }

    private async login(req: Request): Promise<LoginResponse> {
        const userIdentity = <UserIdentity>req.user;
        if (userIdentity) {
            return {
                userFact: {

                },
                profile: userIdentity.profile
            };
        }
        else {
            throw new Error('User not authenticated');
        }
    }
}