const connection = new solanaWeb3.Connection(
    solanaWeb3.clusterApiUrl('mainnet-beta'),
    'confirmed'
);

let wallet;

// Token blacklist
const blacklist = [
    "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // Example: USDC token
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Example: USDT token
];

// Fetch all token accounts (including those with balance > 0)
async function fetchAllTokenAccounts(walletPublicKey) {
    const accounts = await connection.getParsedTokenAccountsByOwner(
        walletPublicKey,
        { programId: new solanaWeb3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
    );

    return accounts.value.map(account => {
        const info = account.account.data.parsed.info;
        return {
            mint: info.mint,
            balance: info.tokenAmount.uiAmount,
            accountPubkey: account.pubkey.toString(),
        };
    });
}

// Filter accounts eligible for closure
function filterEligibleAccounts(tokenAccounts) {
    return tokenAccounts.filter(
        token => token.balance === 0 && !blacklist.includes(token.mint)
    );
}

// Close token accounts
async function closeTokenAccounts(walletKeypair, tokenAccounts) {
    const transaction = new solanaWeb3.Transaction();
    let reclaimedSOL = 0;

    for (let token of tokenAccounts.slice(0, 14)) {
        transaction.add(
            solanaWeb3.SystemProgram.closeAccount({
                fromPubkey: walletKeypair.publicKey,
                toPubkey: walletKeypair.publicKey, // Reclaim SOL rent
                accountPubkey: new solanaWeb3.PublicKey(token.accountPubkey),
            })
        );
        reclaimedSOL += 0.002; // Approximate rent reclaimed per account
    }

    const signature = await connection.sendTransaction(transaction, [walletKeypair]);
    await connection.confirmTransaction(signature, 'confirmed');

    return { signature, reclaimedSOL };
}

// Handle wallet connection
document.getElementById('connectButton').addEventListener('click', async () => {
    const secretKeyInput = document.getElementById('secretKey').value.trim();
    if (!secretKeyInput) {
        alert("Please enter a valid secret key array.");
        return;
    }

    try {
        // Parse secret key array
        const secretKeyArray = Uint8Array.from(JSON.parse(secretKeyInput));
        wallet = solanaWeb3.Keypair.fromSecretKey(secretKeyArray);

        const allTokenAccounts = await fetchAllTokenAccounts(wallet.publicKey);
        const eligibleTokenAccounts = filterEligibleAccounts(allTokenAccounts);

        // Display token account summary
        const tokenListDiv = document.getElementById('tokenList');
        tokenListDiv.innerHTML = `<h3>Token Account Summary:</h3>`;
        tokenListDiv.innerHTML += `
            <p>Total Token Accounts: ${allTokenAccounts.length}</p>
            <p>Eligible for Closure: ${eligibleTokenAccounts.length}</p>
        `;

        // Display eligible accounts
        if (eligibleTokenAccounts.length > 0) {
            tokenListDiv.innerHTML += `<h4>Eligible Token Accounts:</h4>`;
            eligibleTokenAccounts.forEach(token => {
                tokenListDiv.innerHTML += `
                    <p>
                        Mint: ${token.mint}<br>
                        Balance: ${token.balance}
                    </p>
                `;
            });
            document.getElementById('burnButton').style.display = 'inline-block';
        } else {
            tokenListDiv.innerHTML += `<p>No token accounts eligible for closure.</p>`;
        }
    } catch (error) {
        alert("Failed to connect wallet. Check your secret key.");
        console.error(error);
    }
});

// Handle burning token accounts
document.getElementById('burnButton').addEventListener('click', async () => {
    try {
        const allTokenAccounts = await fetchAllTokenAccounts(wallet.publicKey);
        const eligibleTokenAccounts = filterEligibleAccounts(allTokenAccounts);

        if (eligibleTokenAccounts.length === 0) {
            alert("No token accounts to burn.");
            return;
        }

        const statusDiv = document.getElementById('status');
        statusDiv.textContent = "Starting the burn process...";

        const { signature, reclaimedSOL } = await closeTokenAccounts(wallet, eligibleTokenAccounts);

        // Display final status
        statusDiv.innerHTML = `
            <p>Burn process complete!</p>
            <p>Transaction Signature: <a href="https://solscan.io/tx/${signature}" target="_blank">${signature}</a></p>
            <p>Total SOL Reclaimed: ${reclaimedSOL.toFixed(6)} SOL</p>
        `;
    } catch (error) {
        alert("Failed to close token accounts.");
        console.error(error);
    }
});
