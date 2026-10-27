import { createMemoryRepo } from "@/lib/repo/memory";
import { repoContract } from "./contract";

describe("메모리 저장소", () => repoContract(createMemoryRepo));
