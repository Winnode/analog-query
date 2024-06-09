import readline from 'readline';
import { TimegraphClient } from "@analog-labs/timegraph-js";
import { new_cert, build_apikey, encode_ssk, build_ssk } from "@analog-labs/timegraph-wasm";
import { Keyring } from "@polkadot/keyring";
import { waitReady } from "@polkadot/wasm-crypto";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const account = { addr: "Address", phrase: "seed" };

function extractFieldsFromSQL(sql) {
    const regex = /SELECT (.*) FROM/;
    const matches = regex.exec(sql);
    if (matches && matches[1]) {
        const fields = matches[1].split(',').map(field => {
            const parts = field.trim().split(' AS ');
            return parts[0].trim().split('.')[1] || parts[0].trim().split('.')[0];
        });
        return fields.map(field => field.toLowerCase()); 
    }
    return [];
}

(async () => {
    await waitReady();
    const keyring = new Keyring({ type: "sr25519" });

    rl.question('HashId         : ', (input) => {

        let hashId = input.includes('watch.testnet.analog.one/#/view/') ? input.split('/').pop() : input;

        rl.question('Name           : ', async (name) => {
            try {
                const keyPair = keyring.addFromUri(account.phrase);
                let [cert_data, secret] = new_cert(account.addr, "developer");
                const signature = keyPair.sign(cert_data);
                const key = build_apikey(secret, cert_data, signature);

                const ssk_data = encode_ssk({
                    ns: 0,
                    key: account.addr,
                    user_id: 1,
                    expiration: 0,
                });

                const ssk_signature = keyPair.sign(ssk_data);
                const ssk = build_ssk(ssk_data, ssk_signature);

                const client = new TimegraphClient({
                    url: "https://timegraph.testnet.analog.one/graphql",
                    sessionKey: ssk,
                });

                const response1 = await client.alias.add({
                    hashId: hashId, 
                    name: name,
                });
                console.log(` `);
                console.log(`Querying       : \x1b[33m${account.addr}\x1b[0m`);
                console.log(`Status         : ${response1.status}`);
                console.log(`Function       : ${response1.function || "None"}`);
                console.log(` `);
                console.log(`[View Details]`);
                console.log(`Hash ID        : ${response1.view.hashId}`);
                console.log(`Name           : ${response1.view.name}`);
                console.log(`Description    : ${response1.view.description || "No description available"}`);
                console.log(`Identifier     : ${response1.view.identifier}`);
                console.log(`SQL            : ${response1.view.sql}`);
                console.log(` `);
                console.log(`Creator        : \x1b[32m$${response1.view.creator}\x1b[0m`);
                console.log(`References     : ${response1.view.references.length} reference(s)`);
                console.log(` `);

                const sql = response1.view.sql;
                const fieldSets = [extractFieldsFromSQL(sql)];

                let response2;
                for (let fields of fieldSets) {
                    try {
                        response2 = await client.view.data({
                            hashId: hashId,
                            fields: fields,
                            limit: "10",
                        });
                        console.log(`\x1b[31mData view for account ${account.addr} with fields ${fields.join(', ')}:\x1b[0m`);
                        console.table(response2);
                        if (response2 && response2.length > 0) {
                            break; 
                        }
                    } catch (error) {
                        console.error(`Error with fields ${fields.join(", ")}:`, error);
                    }
                }
            } catch (error) {
                console.error(`Error processing account ${account.addr}:`, error);
            }
            rl.close();
        });
    });
})();
