var web3;
var AgentContract;
var contractInstance;
var DEFAULT_AGENT_CONTRACT_ADDRESS = "";

var CONTRACT_ABI = [
  {"constant":false,"inputs":[{"name":"_name","type":"string"},{"name":"_age","type":"uint256"},{"name":"_designation","type":"uint256"},{"name":"_hash","type":"string"}],"name":"add_agent","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"nonpayable","type":"function"},
  {"constant":false,"inputs":[{"name":"addr","type":"address"}],"name":"permit_access","outputs":[],"payable":true,"stateMutability":"payable","type":"function"},
  {"constant":false,"inputs":[{"name":"daddr","type":"address"}],"name":"revoke_access","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},
  {"constant":false,"inputs":[{"name":"paddr","type":"address"},{"name":"_diagnosis","type":"uint256"},{"name":"_hash","type":"string"}],"name":"insurance_claimm","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},
  {"constant":false,"inputs":[{"name":"paddr","type":"address"},{"name":"_hash","type":"string"}],"name":"set_hash_public","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},
  {"constant":false,"inputs":[{"name":"paddr","type":"address"},{"name":"daddr","type":"address"}],"name":"remove_patient","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},
  {"constant":true,"inputs":[{"name":"addr","type":"address"}],"name":"get_patient","outputs":[{"name":"","type":"string"},{"name":"","type":"uint256"},{"name":"","type":"uint256[]"},{"name":"","type":"address"},{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[{"name":"addr","type":"address"}],"name":"get_doctor","outputs":[{"name":"","type":"string"},{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[],"name":"get_patient_list","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[],"name":"get_doctor_list","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[{"name":"addr","type":"address"}],"name":"get_accessed_doctorlist_for_patient","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[{"name":"addr","type":"address"}],"name":"get_accessed_patientlist_for_doctor","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[{"name":"paddr","type":"address"}],"name":"get_hash","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[{"name":"paddr","type":"address"},{"name":"daddr","type":"address"}],"name":"get_patient_doctor_name","outputs":[{"name":"","type":"string"},{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[{"name":"paddr","type":"address"},{"name":"daddr","type":"address"}],"name":"hasAccess","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"}
];

function resolveContractAddressFromConfig() {
  var url = new URL(window.location.href);
  var fromQuery = url.searchParams.get("contractAddress");
  if (fromQuery) {
    window.localStorage.setItem("agentContractAddress", fromQuery);
    return fromQuery;
  }

  var fromStorage = window.localStorage.getItem("agentContractAddress");
  if (fromStorage) {
    return fromStorage;
  }

  if (window.AGENT_CONTRACT_ADDRESS) {
    return window.AGENT_CONTRACT_ADDRESS;
  }

  if (DEFAULT_AGENT_CONTRACT_ADDRESS) {
    return DEFAULT_AGENT_CONTRACT_ADDRESS;
  }

  return "";
}

function fetchContractAddressFromBuild() {
  return new Promise(function(resolve) {
    $.getJSON("/build/contracts/Agent.json")
      .done(function(artifact) {
        if (!artifact || !artifact.networks) {
          resolve("");
          return;
        }

        var networkIds = Object.keys(artifact.networks).sort(function(a, b) {
          return Number(b) - Number(a);
        });

        for (var i = 0; i < networkIds.length; i++) {
          var network = artifact.networks[networkIds[i]];
          if (network && network.address) {
            resolve(network.address);
            return;
          }
        }

        resolve("");
      })
      .fail(function() {
        resolve("");
      });
  });
}

function resolveContractAddress() {
  return new Promise(async function(resolve, reject) {
    var configured = resolveContractAddressFromConfig();
    if (configured) {
      resolve(configured);
      return;
    }

    var fromBuild = await fetchContractAddressFromBuild();
    if (fromBuild) {
      window.localStorage.setItem("agentContractAddress", fromBuild);
      resolve(fromBuild);
      return;
    }

    reject(new Error("Contract address not found. Run truffle migrate and open app with ?contractAddress=... once."));
  });
}

function normalizeAddress(address) {
  return address ? address.toLowerCase() : "";
}

function normalizeAddressList(addresses) {
  return (addresses || []).map(function(address) {
    return normalizeAddress(address);
  });
}

function getCurrentAccount() {
  if (window.ethereum && window.ethereum.selectedAddress) {
    return window.ethereum.selectedAddress;
  }

  if (web3 && web3.eth && web3.eth.accounts && web3.eth.accounts.length > 0) {
    return web3.eth.accounts[0];
  }

  return null;
}

function waitForTransactionReceipt(txHash, intervalMs, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var startedAt = Date.now();
    var pollInterval = intervalMs || 1000;
    var timeout = timeoutMs || 120000;

    function checkReceipt() {
      web3.eth.getTransactionReceipt(txHash, function(error, receipt) {
        if (error) {
          reject(error);
          return;
        }

        if (receipt) {
          resolve(receipt);
          return;
        }

        if (Date.now() - startedAt >= timeout) {
          reject(new Error("Timed out while waiting for transaction confirmation"));
          return;
        }

        setTimeout(checkReceipt, pollInterval);
      });
    }

    checkReceipt();
  });
}

async function connect() {
  if (!window.ethereum) {
    throw new Error("MetaMask not detected.");
  }

  if (contractInstance) {
    return getCurrentAccount();
  }

  web3 = new Web3(window.ethereum);
  await window.ethereum.request({ method: "eth_requestAccounts" });

  var agentContractAddress = await resolveContractAddress();
  AgentContract = web3.eth.contract(CONTRACT_ABI);
  contractInstance = AgentContract.at(agentContractAddress);

  var account = getCurrentAccount();
  if (!account) {
    throw new Error("No wallet account selected in MetaMask.");
  }

  web3.eth.defaultAccount = account;
  console.log("Connected account:", web3.eth.defaultAccount);
  console.log("Contract address:", agentContractAddress);

  return account;
}

if (window.ethereum && window.ethereum.on) {
  window.ethereum.on("accountsChanged", function(accounts) {
    if (accounts && accounts.length > 0 && web3 && web3.eth) {
      web3.eth.defaultAccount = accounts[0];
    }
  });
}

window.addEventListener("load", async function () {
  try {
    await connect();
  } catch (error) {
    console.warn(error.message || error);
  }
});

function readIpfsText(hash) {
  return new Promise(function(resolve, reject) {
    if (!hash) {
      reject(new Error("Missing IPFS hash"));
      return;
    }

    var gateway = "http://127.0.0.1:8080";
    $.get(gateway + "/ipfs/" + hash)
      .done(function(data) {
        resolve(data);
      })
      .fail(function(error) {
        reject(error);
      });
  });
}

function formatUint(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object" && typeof value.toString === "function") {
    return value.toString(10);
  }

  return String(value);
}
