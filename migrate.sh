#!/usr/bin/env bash
set -euo pipefail

# ===== Pretty output =====
info(){ echo -e "\033[1;34m[i]\033[0m $*"; }
ok(){ echo -e "\033[1;32m[✓]\033[0m $*"; }
warn(){ echo -e "\033[1;33m[!]\033[0m $*"; }
err(){ echo -e "\033[1;31m[x]\033[0m $*"; }

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    err "Run as root: sudo bash migrate.sh"
    exit 1
  fi
}

cmd_exists(){ command -v "$1" >/dev/null 2>&1; }

detect_os() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    echo "${ID:-unknown}"
  else
    echo "unknown"
  fi
}

apt_install() {
  local pkgs=("$@")
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y "${pkgs[@]}"
}

install_docker_debian_ubuntu() {
  info "Installing Docker (Debian/Ubuntu)…"
  apt_install ca-certificates curl gnupg lsb-release

  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  local os
  os="$(detect_os)"
  local arch
  arch="$(dpkg --print-architecture)"
  local codename
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME:-}")"

  if [[ -z "$codename" ]]; then
    codename="$(lsb_release -cs 2>/dev/null || echo "")"
  fi

  if [[ "$os" == "ubuntu" ]]; then
    echo \
      "deb [arch=$arch signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $codename stable" > /etc/apt/sources.list.d/docker.list
  elif [[ "$os" == "debian" ]]; then
    echo \
      "deb [arch=$arch signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
      $codename stable" > /etc/apt/sources.list.d/docker.list
  else
    warn "Unknown distro ($os). Attempting apt install docker.io instead."
    apt_install docker.io
    systemctl enable --now docker || true
    return
  fi

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  ok "Docker installed."
}

ensure_docker() {
  if cmd_exists docker; then
    ok "Docker is installed."
  else
    local os
    os="$(detect_os)"
    if [[ "$os" == "ubuntu" || "$os" == "debian" ]]; then
      install_docker_debian_ubuntu
    else
      err "Docker not found and OS not supported for auto-install. Install Docker manually, then re-run."
      exit 1
    fi
  fi

  if ! docker info >/dev/null 2>&1; then
    err "Docker daemon not running. Try: systemctl start docker"
    exit 1
  fi
}

ensure_node() {
  if cmd_exists node && cmd_exists npm; then
    ok "Node + npm are installed."
    return
  fi

  warn "Node/npm not found. Installing via apt (Debian/Ubuntu)…"
  local os
  os="$(detect_os)"
  if [[ "$os" != "ubuntu" && "$os" != "debian" ]]; then
    err "Auto-install of Node only supports Debian/Ubuntu. Install Node.js manually then re-run."
    exit 1
  fi

  apt_install nodejs npm
  ok "Installed Node + npm."
}

prompt_nonempty() {
  local varname="$1"
  local prompt="$2"
  local secret="${3:-false}"
  local val=""
  while [[ -z "$val" ]]; do
    if [[ "$secret" == "true" ]]; then
      read -r -s -p "$prompt" val
      echo
    else
      read -r -p "$prompt" val
    fi
    val="${val//[$'\t\r\n']}"
  done
  printf -v "$varname" '%s' "$val"
}

ensure_containers() {
  info "Starting MongoDB container (PRIVATE)…"
  if docker ps -a --format '{{.Names}}' | grep -qx 'mongo'; then
    docker start mongo >/dev/null
  else
    # Bind mongo ONLY to localhost so it is not exposed publicly.
    docker run -d \
      --name mongo \
      --restart unless-stopped \
      -p 127.0.0.1:27017:27017 \
      -v mongo_data:/data/db \
      mongo:7 >/dev/null
  fi
  ok "MongoDB container running (bound to 127.0.0.1:27017)."

  info "Starting mongo-express UI on port 8081 (PUBLIC but password-protected)…"
  if docker ps -a --format '{{.Names}}' | grep -qx 'mongo-express'; then
    docker start mongo-express >/dev/null
  else
    # mongo-express talks to mongo on host network via 127.0.0.1:27017.
    # We expose mongo-express to the world on 8081 (you can firewall later).
    docker run -d \
      --name mongo-express \
      --restart unless-stopped \
      -p 0.0.0.0:8081:8081 \
      -e ME_CONFIG_MONGODB_URL="mongodb://host.docker.internal:27017" \
      -e ME_CONFIG_BASICAUTH_USERNAME="$MEXP_USER" \
      -e ME_CONFIG_BASICAUTH_PASSWORD="$MEXP_PASS" \
      mongo-express:latest >/dev/null || {
        # Fallback for Linux where host.docker.internal may not resolve:
        docker rm -f mongo-express >/dev/null 2>&1 || true
        docker run -d \
          --name mongo-express \
          --restart unless-stopped \
          --network host \
          -e ME_CONFIG_MONGODB_URL="mongodb://127.0.0.1:27017" \
          -e ME_CONFIG_BASICAUTH_USERNAME="$MEXP_USER" \
          -e ME_CONFIG_BASICAUTH_PASSWORD="$MEXP_PASS" \
          mongo-express:latest >/dev/null
      }
  fi
  ok "mongo-express UI running."
}

write_node_migrator() {
  mkdir -p "$WORKDIR"
  cat <<'JS' > "$WORKDIR/migrate_firestore_to_mongo.js"
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { MongoClient } = require("mongodb");

// ---- Helpers to convert Firestore types to JSON-friendly values ----
function toPlain(value) {
  if (value && typeof value === "object") {
    // Firestore Timestamp
    if (typeof value.toDate === "function") {
      try { return value.toDate().toISOString(); } catch { /* ignore */ }
    }
    // GeoPoint
    if (typeof value.latitude === "number" && typeof value.longitude === "number") {
      return { latitude: value.latitude, longitude: value.longitude };
    }
    // DocumentReference
    if (typeof value.path === "string" && value.id) return { __ref: value.path };

    if (Array.isArray(value)) return value.map(toPlain);

    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

async function main() {
  const serviceKeyPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
  const mongoUri = process.env.MONGO_URI;
  const mongoDbName = process.env.MONGO_DB;
  const collectionsArg = process.env.COLLECTIONS || "";

  if (!serviceKeyPath || !fs.existsSync(serviceKeyPath)) {
    throw new Error("SERVICE_ACCOUNT_KEY_PATH is missing or file does not exist.");
  }
  if (!mongoUri) throw new Error("MONGO_URI missing.");
  if (!mongoDbName) throw new Error("MONGO_DB missing.");

  // Init Firebase Admin
  const keyJson = require(path.resolve(serviceKeyPath));
  admin.initializeApp({ credential: admin.credential.cert(keyJson) });
  const db = admin.firestore();

  // Determine which root collections to migrate
  let rootCollections = [];
  if (collectionsArg.trim()) {
    rootCollections = collectionsArg.split(",").map(s => s.trim()).filter(Boolean);
  } else {
    const cols = await db.listCollections();
    rootCollections = cols.map(c => c.id);
  }

  if (!rootCollections.length) {
    console.log("No root collections found.");
    return;
  }

  console.log("Root collections to migrate:", rootCollections.join(", "));

  // Connect to Mongo
  const client = new MongoClient(mongoUri, { maxPoolSize: 10 });
  await client.connect();
  const mdb = client.db(mongoDbName);

  let totalDocs = 0;

  for (const colName of rootCollections) {
    console.log(`\n==> Migrating collection: ${colName}`);
    const colRef = db.collection(colName);

    // Ensure collection exists in Mongo
    const mcol = mdb.collection(colName);

    // Stream-ish pagination (Firestore does not provide true server streaming in Admin SDK)
    const snap = await colRef.get();
    console.log(`   Firestore docs found: ${snap.size}`);

    if (snap.empty) continue;

    const ops = [];
    for (const doc of snap.docs) {
      const data = toPlain(doc.data());
      // Preserve Firestore doc id as Mongo _id for stable IDs
      const row = { _id: doc.id, ...data };

      // Upsert so re-running script won't duplicate
      ops.push({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: row },
          upsert: true
        }
      });

      // Bulk write in chunks
      if (ops.length >= 500) {
        const res = await mcol.bulkWrite(ops, { ordered: false });
        totalDocs += (res.upsertedCount + res.modifiedCount + res.matchedCount);
        ops.length = 0;
        process.stdout.write("   ...written 500\n");
      }
    }

    if (ops.length) {
      const res = await mcol.bulkWrite(ops, { ordered: false });
      totalDocs += (res.upsertedCount + res.modifiedCount + res.matchedCount);
    }

    console.log(`   ✅ Done: ${colName}`);
  }

  await client.close();
  console.log(`\n✅ Migration complete. (Note: totalDocs counter is approximate due to matched vs modified.)`);
  console.log(`Mongo DB: ${mongoDbName}`);
}

main().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
JS
}

install_node_deps() {
  info "Preparing Node project + installing dependencies…"
  mkdir -p "$WORKDIR"
  if [[ ! -f "$WORKDIR/package.json" ]]; then
    (cd "$WORKDIR" && npm init -y >/dev/null)
  fi
  (cd "$WORKDIR" && npm install firebase-admin mongodb >/dev/null)
  ok "Node dependencies installed."
}

print_ui_info() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -z "$ip" ]]; then ip="YOUR_VPS_IP"; fi

  echo
  ok "mongo-express UI:"
  echo "   URL:  http://$ip:8081"
  echo "   User: $MEXP_USER"
  echo "   Pass: (what you entered)"
  echo
  warn "Recommendation: allow only YOUR IP to port 8081 using a firewall, or put this behind Nginx + auth."
  echo
}

run_migration() {
  info "Running Firestore -> Mongo migration…"
  SERVICE_ACCOUNT_KEY_PATH="$SERVICE_KEY_PATH" \
  MONGO_URI="mongodb://127.0.0.1:27017" \
  MONGO_DB="$MONGO_DB" \
  COLLECTIONS="$COLLECTIONS" \
  node "$WORKDIR/migrate_firestore_to_mongo.js"
  ok "Migration finished."
}

main() {
  require_root

  info "Firestore -> MongoDB migration (Mongo in Docker + mongo-express UI)"
  echo

  prompt_nonempty MEXP_USER "Set mongo-express username: "
  prompt_nonempty MEXP_PASS "Set mongo-express password: " true

  ensure_docker

  # On Ubuntu/Debian, ensure curl exists for installs (often already there)
  if ! cmd_exists curl; then
    local os
    os="$(detect_os)"
    if [[ "$os" == "ubuntu" || "$os" == "debian" ]]; then
      apt_install curl
    fi
  fi

  ensure_node

  # Workspace
  WORKDIR="/opt/fs-to-mongo"
  export WORKDIR

  ensure_containers
  print_ui_info

  prompt_nonempty SERVICE_KEY_PATH "Path to Firebase serviceAccountKey.json (paste full path): "
  if [[ ! -f "$SERVICE_KEY_PATH" ]]; then
    err "File not found: $SERVICE_KEY_PATH"
    exit 1
  fi

  prompt_nonempty MONGO_DB "Mongo database name to write into (e.g. mydb): "

  read -r -p "Collections (comma-separated) or press Enter to auto-detect root collections: " COLLECTIONS || true
  COLLECTIONS="${COLLECTIONS:-}"

  write_node_migrator
  install_node_deps
  run_migration

  echo
  ok "All done."
  echo "If you want to stop UI later: docker stop mongo-express"
  echo "If you want to stop Mongo later: docker stop mongo"
}

main "$@"
