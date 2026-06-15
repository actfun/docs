import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { Route, Switch } from "wouter";
import { config, arcTestnet } from "@/lib/wagmi";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { DynamicWagmiConnector } from "@dynamic-labs/wagmi-connector";
import LandingPage from "@/pages/LandingPage";
import PredictionPage from "@/pages/PredictionPage";
import HomePage from "@/pages/HomePage";
import CreateTokenPage from "@/pages/CreateTokenPage";
import TokenDetailPage from "@/pages/TokenDetailPage";
import CardPage from "@/pages/CardPage";
import LeaderboardPage from "@/pages/LeaderboardPage";
import HallOfFamePage from "@/pages/HallOfFamePage";
import PerpsPage from "@/pages/PerpsPage";
import LendPage from "@/pages/LendPage";
import { MiningTrackerProvider } from "@/context/MiningTrackerContext";
import GraduationAlerts from "@/components/GraduationAlerts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 5000 },
  },
});

const DYNAMIC_ENV_ID = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID as string;

export default function App() {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: DYNAMIC_ENV_ID,
        walletConnectors: [EthereumWalletConnectors],
        initialAuthenticationMode: "connect-only",
        overrides: {
          evmNetworks: [
            {
              blockExplorerUrls: ["https://testnet.arcscan.app"],
              chainId: arcTestnet.id,
              chainName: "Arc Testnet",
              iconUrls: [],
              name: "Arc Testnet",
              nativeCurrency: {
                decimals: 18,
                name: "USDC",
                symbol: "USDC",
              },
              networkId: arcTestnet.id,
              rpcUrls: ["https://rpc.testnet.arc.network"],
              vanityName: "Arc Testnet",
            },
          ],
        },
        appName: "ACTFUN",
        appLogoUrl: `${window.location.origin}/minepad-logo.png`,
      }}
    >
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <DynamicWagmiConnector>
            <MiningTrackerProvider>
              <div className="min-h-screen bg-background text-foreground">
                <Switch>
                  <Route path="/"               component={LandingPage}     />
                  <Route path="/minepad"        component={HomePage}        />
                  <Route path="/create"         component={CreateTokenPage} />
                  <Route path="/token/:address" component={TokenDetailPage} />
                  <Route path="/card/:address"  component={CardPage}        />
                  <Route path="/leaderboard"   component={LeaderboardPage} />
                  <Route path="/hall-of-fame"  component={HallOfFamePage}  />
                  <Route path="/perps"         component={PerpsPage}       />
                  <Route path="/lend"          component={LendPage}        />
                  <Route path="/predict"       component={PredictionPage}  />
                  <Route>
                    <div className="flex items-center justify-center min-h-screen text-muted-foreground">
                      Page not found
                    </div>
                  </Route>
                </Switch>
                <GraduationAlerts />
              </div>
            </MiningTrackerProvider>
          </DynamicWagmiConnector>
        </QueryClientProvider>
      </WagmiProvider>
    </DynamicContextProvider>
  );
}
