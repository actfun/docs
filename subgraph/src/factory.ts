import { BigInt } from "@graphprotocol/graph-ts";
import { TokenCreated } from "../generated/LaunchpadFactory/LaunchpadFactory";
import { Token } from "../generated/schema";
import { TokenLauncher } from "../generated/templates";

export function handleTokenCreated(event: TokenCreated): void {
  // Anchor the Token entity on the launcher address — it is the contract that
  // emits mining/graduation events and the key the web app routes by.
  let id = event.params.launcherAddress;
  let token = new Token(id);
  token.tokenAddress = event.params.tokenAddress;
  token.launcher = event.params.launcherAddress;
  token.creator = event.params.creator;
  token.name = event.params.name;
  token.symbol = event.params.symbol;
  token.imageUri = event.params.imageUri;
  token.maxSupply = event.params.maxSupply;
  token.feePerMine = event.params.feePerMine;
  token.createdAtBlock = event.block.number;
  token.createdAtTimestamp = event.block.timestamp;
  token.createdTxHash = event.transaction.hash;
  token.mineCount = BigInt.zero();
  token.totalMined = BigInt.zero();
  token.graduated = false;
  token.save();

  // Spin up a dynamic data source so this launcher's events are indexed.
  TokenLauncher.create(event.params.launcherAddress);
}
