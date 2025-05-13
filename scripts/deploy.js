//Deploy the contract
const hre = require("hardhat");

async function main() {
    const DocumentNotary = await hre.ethers.getContractFactory("DocumentNotary");
    const contract = await DocumentNotary.deploy();

    await contract.waitForDeployment();
    const address = await contract.getAddress();
    console.log(`DocumentNotary successfully deployed to: ${address}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
