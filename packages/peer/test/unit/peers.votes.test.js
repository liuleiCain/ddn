/**
 * passed
 */
import node from "@ddn/node-sdk/lib/test";

import DdnUtils from '@ddn/utils';
import Debug from "debug";

const debug = new Debug('peer');

const account = node.randomAccount();
const voterAccount = node.randomAccount();

let delegate1_pubKey;
let delegate2_pubKey;

describe("POST /peer/transactions", () => {

    beforeAll(done => {
        node.api.post("/accounts/open")
            .set("Accept", "application/json")
            .send({
                secret: voterAccount.password
            })
            .expect("Content-Type", /json/)
            .expect(200)
            .end((err, {body}) => {
                node.expect(body).to.have.property("success").to.be.true;
                if (body.success == true && body.account != null) {
                    voterAccount.address = body.account.address;
                    voterAccount.publicKey = body.account.publicKey;
                    voterAccount.balance = body.account.balance;
                } else {
                    debug("Unable to open voterAccount, tests will fail");
                    debug(`Data sent: secret: ${voterAccount.password} , secondSecret: ${voterAccount.secondPassword}`);
                    node.expect("TEST").to.equal("FAILED");
                }

                // Send random DDN amount from genesis account to Random account
                node.api.put("/transactions")
                    .set("Accept", "application/json")
                    .send({
                        secret: node.Gaccount.password,
                        amount: node.RANDOM_COIN,
                        recipientId: voterAccount.address
                    })
                    .expect("Content-Type", /json/)
                    .expect(200)
                    .end((err, {body}) => {
                        debug(JSON.stringify(body));
                        node.expect(body).to.have.property("success").to.be.true;
                        node.expect(body).to.have.property("transactionId");
                        if (body.success == true && body.transactionId != null) {
                            node.expect(body.transactionId).to.be.a('string');
                            voterAccount.amount = DdnUtils.bignum.plus(voterAccount.amount, node.RANDOM_COIN).toString();
                        } else {
                            debug("Sent: secret: " + node.Gaccount.password + ", amount: " + node.RANDOM_COIN + ", recipientId: " + voterAccount.address);
                            node.expect("TEST").to.equal("FAILED");
                        }
                        node.onNewBlock(done);
                    });
            });
    });

    beforeAll(done => {
        node.api.get("/delegates/")
            .expect("Content-Type", /json/)
            .expect(200)
            .end(async (err, {body}) => {
                node.expect(body).to.have.property("success").to.be.true;
                delegate1_pubKey = body.delegates[0].publicKey;
                delegate2_pubKey = body.delegates[1].publicKey;
                const votes = [];
                votes.push(`+${delegate1_pubKey}`);
                votes.push(`+${delegate2_pubKey}`);
                const transaction = await node.ddn.vote.createVote(votes, voterAccount.password);
                debug('createVote transaction', transaction);
                if (transaction !== null) {
                    node.peer.post("/transactions")
                        .set("Accept", "application/json")
                        .set("version", node.version)
                        .set("nethash", node.config.nethash)
                        .set("port", node.config.port)
                        .send({
                            transaction
                        })
                        .expect("Content-Type", /json/)
                        .expect(200)
                        .end((err, {body}) => {
                            debug("Sent vote fix for delegates");
                            debug(`Sent: ${JSON.stringify(transaction)} Got reply: ${JSON.stringify(body)}`);
                            node.expect(body).to.have.property("success").to.be.true;
                            done();
                        });
                } else {
                    done();
                }
            });
    });

    it("Voting twice for a delegate. Should fail", done => {
        node.onNewBlock(async err => {
            const transaction = await node.ddn.vote.createVote([`+${delegate1_pubKey}`], voterAccount.password);
            node.peer.post("/transactions")
                .set("Accept", "application/json")
                .set("version", node.version)
                .set("nethash", node.config.nethash)
                .set("port", node.config.port)
                .send({
                    transaction
                })
                .expect("Content-Type", /json/)
                .expect(200)
                .end((err, {body}) => {
                    debug("Sending POST /transactions with data: " + JSON.stringify(transaction) + " Got reply: " + JSON.stringify(body));
                    node.expect(body).to.have.property("success").to.be.false;
                    done();
                });
        });
    });

    it("Removing votes from a delegate. Should be ok", async done => {
        const transaction = await node.ddn.vote.createVote([`-${delegate1_pubKey}`], voterAccount.password);
        node.peer.post("/transactions")
            .set("Accept", "application/json")
            .set("version",node.version)
            .set("nethash", node.config.nethash)
            .set("port",node.config.port)
            .send({
                transaction
            })
            .expect("Content-Type", /json/)
            .expect(200)
            .end((err, {body}) => {
                debug(JSON.stringify(body));
                node.expect(body).to.have.property("success").to.be.true;
                done();
            });
    });

    it("Removing votes from a delegate and then voting again. Should fail", done => {
        node.onNewBlock(async err => {
            const transaction = await node.ddn.vote.createVote([`-${delegate2_pubKey}`], voterAccount.password);
            node.peer.post("/transactions")
                .set("Accept", "application/json")
                .set("version", node.version)
                .set("nethash", node.config.nethash)
                .set("port", node.config.port)
                .send({
                    transaction
                })
                .expect("Content-Type", /json/)
                .expect(200)
                .end(async (err, {body}) => {
                    debug("Sent POST /transactions with data:" + JSON.stringify(transaction) + "! Got reply:" + JSON.stringify(body));
                    node.expect(body).to.have.property("success").to.be.true;
                    const transaction2 = await node.ddn.vote.createVote([`+${delegate2_pubKey}`], voterAccount.password);
                    node.peer.post("/transactions")
                        .set("Accept", "application/json")
                        .set("version", node.version)
                        .set("nethash", node.config.nethash)
                        .set("port", node.config.port)
                        .send({
                            transaction: transaction2
                        })
                        .expect("Content-Type", /json/)
                        .expect(200)
                        .end((err, {body}) => {
                            debug("Sent POST /transactions with data: " + JSON.stringify(transaction2) + "!. Got reply: " + body);
                            node.expect(body).to.have.property("success").to.be.false;
                            done();
                        });
                });
        });
    });

    // Not right test, because sometimes new block comes and we don't have time to vote
    it("Registering a new delegate. Should be ok", done => {
        node.api.post("/accounts/open")
            .set("Accept", "application/json")
            .set("version",node.version)
            .set("nethash", node.config.nethash)
            .set("port",node.config.port)
            .send({
                secret: account.password
            })
            .expect("Content-Type", /json/)
            .expect(200)
            .end((err, {body}) => {
                if (body.success == true && body.account != null){
                    account.address = body.account.address;
                    account.publicKey = body.account.publicKey;
                } else {
                    // debug("Open account failed or account object is null");
                    node.expect(true).to.equal(false);
                    done();
                }

                node.api.put("/transactions")
                    .set("Accept", "application/json")
                    .set("version",node.version)
                    .set("nethash", node.config.nethash)
                    .set("port",node.config.port)
                    .send({
                        secret: node.Gaccount.password,
                        amount: DdnUtils.bignum.plus(node.Fees.delegateRegistrationFee, node.Fees.voteFee),
                        recipientId: account.address
                    })
                    .expect("Content-Type", /json/)
                    .expect(200)
                    .end((err, res) => {
                        node.onNewBlock(async err => {
                            node.expect(err).to.be.not.ok;
                            account.username = node.randomDelegateName().toLowerCase();
                            const transaction = await node.ddn.delegate.createDelegate(account.username, account.password);
                            node.peer.post("/transactions")
                                .set("Accept", "application/json")
                                .set("version",node.version)
                                .set("nethash", node.config.nethash)
                                .set("port",node.config.port)
                                .send({
                                    transaction
                                })
                                .expect("Content-Type", /json/)
                                .expect(200)
                                .end((err, {body}) => {
                                    node.expect(body).to.have.property("success").to.be.true;
                                    done();
                                });
                        });
                    });
            });
    });

    // 不能投给普通用户
    it("Voting for an common user. Should be fail", async done => {
        const transaction = await node.ddn.vote.createVote([`+${account.publicKey}`], account.password);
        node.onNewBlock(err => {
            node.expect(err).to.be.not.ok;
            node.peer.post("/transactions")
                .set("Accept", "application/json")
                .set("version", node.version)
                .set("nethash", node.config.nethash)
                .set("port", node.config.port)
                .send({
                    transaction
                })
                .expect("Content-Type", /json/)
                .expect(200)
                .end((err, {body}) => {
                    debug(body);
                    node.expect(body).to.have.property("success").to.be.false;
                    node.expect(body).to.have.property("error").to.equal('Delegate not found');
                    done();
                });
        });
    });

    // 只有受托人才能接受投票
    it("Voting for a delegate. Should be ok", async done => {
        const transaction = await node.ddn.vote.createVote([`+${delegate2_pubKey}`], account.password);
        node.onNewBlock(err => {
            node.expect(err).to.be.not.ok;
            node.peer.post("/transactions")
                .set("Accept", "application/json")
                .set("version", node.version)
                .set("nethash", node.config.nethash)
                .set("port", node.config.port)
                .send({
                    transaction
                })
                .expect("Content-Type", /json/)
                .expect(200)
                .end((err, {body}) => {
                    debug(body);
                    node.expect(body).to.have.property("success").to.be.true;
                    done();
                });
        });
    });
});
