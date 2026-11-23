/**
 * ============================================================================
 * MOTOR WEBAR — ARQUITETURA MODULAR + MELHOR CÂMERA TRASEIRA + SINCRONIA HUD
 * ============================================================================
 */

const A3_WIDTH = 1.0;
const A3_HEIGHT = 1.4142;
const PAGE_TYPE = document.body.dataset.page || "home";

const btnDownloadZip = document.getElementById("btn-download-zip");
if (window.CONFIG_EXPOSICAO && btnDownloadZip) {
  if (window.CONFIG_EXPOSICAO.urlPdfCartazes) {
    btnDownloadZip.setAttribute("href", window.CONFIG_EXPOSICAO.urlPdfCartazes);
  }
  if (window.CONFIG_EXPOSICAO.nomeArquivoPdf) {
    btnDownloadZip.setAttribute(
      "download",
      window.CONFIG_EXPOSICAO.nomeArquivoPdf,
    );
  }
}

function getPaletteForPerson(person) {
  const grupos = window.GRUPOS_PALETA || {};
  return (
    grupos[person.grupo] || {
      nomeGrupo: "Grupo 1 - Denúncia e Vigilância",
      dot: "#ec1c7a",
      cardBg: "#ec1c7a",
      titleColor: "#f5c400",
      datesColor: "#f5c400",
      textColor: "#ffffff",
      tabSelectedText: "#ec1c7a",
    }
  );
}

/* ============================================================================
   PÁGINA 3: CARTAZES VIRTUAIS (virtuais.html)
   ============================================================================ */
if (PAGE_TYPE === "virtuais") {
  const virtualGrid = document.getElementById("virtual-grid");

  if (virtualGrid) {
    const fragment = document.createDocumentFragment();

    (window.PERSONALIDADES_DB || []).forEach((person, idx) => {
      const palette = getPaletteForPerson(person);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "mockup-card";
      card.style.borderColor = palette.cardBg;

      const img = document.createElement("img");
      img.className = "mockup-thumb";
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = `${person.nomeCompleto} — Mockup ${idx + 1}`;
      img.src = person.imagemMockup || "./assets/mockups/mockup-01.webp";

      const groupSpan = document.createElement("div");
      groupSpan.className = "mockup-group";
      groupSpan.style.color = palette.dot;
      groupSpan.textContent = palette.nomeGrupo;

      const nameSpan = document.createElement("div");
      nameSpan.className = "mockup-name";
      nameSpan.textContent = `0${idx + 1} • ${person.nomeCompleto}`;

      card.append(img, groupSpan, nameSpan);

      card.addEventListener("click", () => {
        window.location.href = `./scanner.html?target=${encodeURIComponent(person.targetIndex)}`;
      });

      fragment.appendChild(card);
    });

    virtualGrid.appendChild(fragment);
  }
}

/* ============================================================================
   PÁGINA 2: SCANNER / AR (scanner.html)
   ============================================================================ */
if (PAGE_TYPE === "scanner") {
  const sceneEl = document.getElementById("ar-scene");
  const reticle = document.getElementById("reticle");
  const groupBannerText = document.getElementById("group-banner-text");

  const personalityHud = document.getElementById("personality-hud");
  const tabDestaque = document.getElementById("tab-destaque");
  const tabPlanejamento = document.getElementById("tab-planejamento");
  const hudPersonName = document.getElementById("hud-person-name");
  const hudPersonDates = document.getElementById("hud-person-dates");
  const hudPersonBody = document.getElementById("hud-person-body");

  let demoPreviewContainer = null;
  let virtualStageEl = null;
  let virtualMockupImgEl = null;
  let virtualPlanImgEl = null;
  let virtualCutoutImgEl = null;
  let virtualPrevArrowEl = null;
  let virtualNextArrowEl = null;
  let isVirtualMode = false;
  let virtualHighlightEnabled = false;
  let currentPerson = null;
  let activeTargetIndex = null;
  let currentTab = "destaque";
  let lostDebounceTimer = null;

  const textureCache = new Map();
  const targetLayersMap = new Map();
  const targetElementsMap = new Map();
  const sharedPlaneGeo = new THREE.PlaneGeometry(
    A3_WIDTH * 1.04,
    A3_HEIGHT * 1.04,
  );
  const planningPlaneGeo = new THREE.PlaneGeometry(
    A3_WIDTH * 1.01,
    A3_HEIGHT * 1.01,
  );

  function navigateVirtualCartaz(direction) {
    const list = [...(window.PERSONALIDADES_DB || [])].sort(
      (a, b) => Number(a.targetIndex) - Number(b.targetIndex),
    );
    if (!list.length || !currentPerson) return;

    const currPos = list.findIndex(
      (p) => Number(p.targetIndex) === Number(currentPerson.targetIndex),
    );
    const basePos = currPos >= 0 ? currPos : 0;
    const nextPos = (basePos + direction + list.length) % list.length;
    const nextPerson = list[nextPos];
    if (!nextPerson) return;

    try {
      const url = new URL(window.location.href);
      url.searchParams.set("target", String(nextPerson.targetIndex));
      window.history.replaceState({}, "", url.toString());
    } catch (_) {}

    window.simulateTarget(nextPerson.targetIndex);
  }

  function createDiscreetArrowButton(id, symbol, sideCss, direction) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = id;
    btn.textContent = symbol;
    btn.setAttribute(
      "aria-label",
      direction < 0 ? "Cartaz anterior" : "Próximo cartaz",
    );
    btn.style.cssText = [
      "position:fixed",
      "top:42%",
      sideCss,
      "transform:translateY(-50%)",
      "z-index:11",
      "width:34px",
      "height:46px",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "background:rgba(17,17,17,0.55)",
      "color:rgba(255,255,255,0.78)",
      "border:1px solid rgba(255,255,255,0.18)",
      "font-family:var(--font-body)",
      "font-size:1.35rem",
      "font-weight:600",
      "line-height:1",
      "cursor:pointer",
      "pointer-events:auto",
    ].join(";");

    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      navigateVirtualCartaz(direction);
    });

    return btn;
  }

  function ensureVirtualStage() {
    if (virtualStageEl) return;

    virtualStageEl = document.createElement("div");
    virtualStageEl.id = "virtual-mockup-stage";
    virtualStageEl.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:4",
      "display:none",
      "align-items:center",
      "justify-content:center",
      "padding:74px 18px 250px",
      "background-color:#141416",
      "pointer-events:none",
    ].join(";");

    const frame = document.createElement("div");
    frame.style.cssText = [
      "position:relative",
      "height:100%",
      "max-height:100%",
      "max-width:100%",
      "aspect-ratio:1/1.414",
      "display:flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");

    virtualMockupImgEl = document.createElement("img");
    virtualMockupImgEl.style.cssText = [
      "width:100%",
      "height:100%",
      "object-fit:contain",
      "display:block",
      "box-shadow:0 12px 30px rgba(0,0,0,0.65)",
    ].join(";");

    virtualPlanImgEl = document.createElement("img");
    virtualPlanImgEl.style.cssText = [
      "position:absolute",
      "inset:0",
      "width:100%",
      "height:100%",
      "object-fit:contain",
      "display:none",
      "box-shadow:0 12px 30px rgba(0,0,0,0.65)",
    ].join(";");

    virtualCutoutImgEl = document.createElement("img");
    virtualCutoutImgEl.style.cssText = [
      "position:absolute",
      "inset:0",
      "width:100%",
      "height:100%",
      "object-fit:contain",
      "display:none",
      "pointer-events:none",
    ].join(";");

    virtualPrevArrowEl = createDiscreetArrowButton(
      "virtual-prev-arrow",
      "‹",
      "left:10px",
      -1,
    );
    virtualNextArrowEl = createDiscreetArrowButton(
      "virtual-next-arrow",
      "›",
      "right:10px",
      1,
    );

    frame.append(virtualMockupImgEl, virtualPlanImgEl, virtualCutoutImgEl);
    virtualStageEl.append(frame, virtualPrevArrowEl, virtualNextArrowEl);
    document.body.insertBefore(virtualStageEl, document.body.firstChild);
  }

  function syncVirtualStage() {
    if (!isVirtualMode || !currentPerson) {
      if (virtualStageEl) virtualStageEl.style.display = "none";
      if (virtualPrevArrowEl) virtualPrevArrowEl.style.display = "none";
      if (virtualNextArrowEl) virtualNextArrowEl.style.display = "none";
      return;
    }

    ensureVirtualStage();
    virtualStageEl.style.display = "flex";
    if (virtualPrevArrowEl) virtualPrevArrowEl.style.display = "inline-flex";
    if (virtualNextArrowEl) virtualNextArrowEl.style.display = "inline-flex";

    const isDestaque = currentTab === "destaque";
    const cfg = currentPerson.destaquePopOut || {};

    if (isDestaque) {
      if (virtualPlanImgEl) virtualPlanImgEl.style.display = "none";

      if (virtualMockupImgEl && currentPerson.imagemMockup) {
        if (
          virtualMockupImgEl.getAttribute("src") !== currentPerson.imagemMockup
        ) {
          virtualMockupImgEl.src = currentPerson.imagemMockup;
        }
        virtualMockupImgEl.alt = `${currentPerson.nomeCompleto} — Mockup`;
        virtualMockupImgEl.style.display = "block";
      }

      const cutoutSrc =
        cfg.arquivoVirtual ||
        cfg.arquivoPNG ||
        cfg.arquivoWebP ||
        cfg.arquivoWEBP ||
        "";

      if (
        virtualCutoutImgEl &&
        virtualHighlightEnabled &&
        cfg.ativo !== false &&
        cutoutSrc
      ) {
        if (virtualCutoutImgEl.getAttribute("src") !== cutoutSrc) {
          virtualCutoutImgEl.src = cutoutSrc;
        }
        const scale = Number(cfg.escalaExtra) || 1.04;
        const posX = (Number(cfg.posX) || 0) * 100;
        const posY = -(Number(cfg.posY) || 0.08) * 100 + 5;
        virtualCutoutImgEl.alt = `${currentPerson.nomeCompleto} — Destaque`;
        virtualCutoutImgEl.style.transform = `translate(${posX}%, ${posY}%) scale(${scale})`;
        virtualCutoutImgEl.style.display = "block";
      } else if (virtualCutoutImgEl) {
        virtualCutoutImgEl.style.display = "none";
      }
    } else {
      virtualHighlightEnabled = false;
      if (virtualCutoutImgEl) virtualCutoutImgEl.style.display = "none";
      if (virtualMockupImgEl) virtualMockupImgEl.style.display = "none";

      const planSrc =
        currentPerson.imagemMockupPlanejamento ||
        currentPerson.arquivoPlanejamento ||
        currentPerson.imagemMockup ||
        "";

      if (virtualPlanImgEl && planSrc) {
        if (virtualPlanImgEl.getAttribute("src") !== planSrc) {
          virtualPlanImgEl.src = planSrc;
        }
        virtualPlanImgEl.alt = `${currentPerson.nomeCompleto} — Planejamento`;
        virtualPlanImgEl.style.display = "block";
      }
    }
  }

  async function getBestRearCameraConstraints() {
    const baseVideoConstraints = {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ focusMode: "continuous" }],
    };

    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return baseVideoConstraints;
    }

    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      tempStream.getTracks().forEach((track) => track.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");

      const rearCameras = videoInputs.filter((d) => {
        const label = (d.label || "").toLowerCase();
        return (
          label.includes("back") ||
          label.includes("rear") ||
          label.includes("environment") ||
          label.includes("traseira")
        );
      });

      const candidates = rearCameras.length > 0 ? rearCameras : videoInputs;

      const mainCamera =
        candidates.find((d) => {
          const label = (d.label || "").toLowerCase();
          const isSecondaryLens =
            label.includes("ultra") ||
            label.includes("wide 0.5") ||
            label.includes("0.5x") ||
            label.includes("macro") ||
            label.includes("depth") ||
            label.includes("tele");
          return !isSecondaryLens;
        }) || candidates[0];

      if (mainCamera && mainCamera.deviceId) {
        return {
          deviceId: { exact: mainCamera.deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: "continuous" }],
        };
      }
    } catch (err) {
      console.warn("Não foi possível enumerar câmeras avançadas:", err);
    }

    return baseVideoConstraints;
  }

  function loadTextureCached(url, onSuccess, onError) {
    if (!url) {
      if (onError) onError();
      return;
    }
    if (textureCache.has(url)) {
      onSuccess(textureCache.get(url));
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        textureCache.set(url, texture);
        onSuccess(texture);
      },
      undefined,
      () => {
        if (onError) onError();
      },
    );
  }

  function update3DModeVisibility() {
    const showDestaque =
      currentTab === "destaque" && (!isVirtualMode || virtualHighlightEnabled);
    targetLayersMap.forEach((layers) => {
      if (layers.destaqueLayer) {
        layers.destaqueLayer.setAttribute("visible", showDestaque);
      }
      if (layers.planejamentoLayer) {
        layers.planejamentoLayer.setAttribute(
          "visible",
          currentTab !== "destaque",
        );
      }
    });
    syncVirtualStage();
  }

  function renderTabContent() {
    if (!currentPerson) return;
    if (hudPersonName) hudPersonName.textContent = currentPerson.nomeCompleto;
    if (hudPersonDates) {
      hudPersonDates.textContent =
        currentPerson.datas || currentPerson.anoNascimento || "";
    }
    if (hudPersonBody) {
      hudPersonBody.textContent =
        currentTab === "planejamento"
          ? currentPerson.comoFoiPlanejado || currentPerson.resumoFeitos
          : currentPerson.resumoFeitos;
    }
    update3DModeVisibility();
  }

  function setActiveTab(tabName) {
    if (isVirtualMode) {
      if (tabName === "destaque") {
        if (currentTab === "destaque") {
          virtualHighlightEnabled = !virtualHighlightEnabled;
        } else {
          currentTab = "destaque";
          virtualHighlightEnabled = true;
        }
      } else if (tabName === "planejamento") {
        if (currentTab === "planejamento") {
          currentTab = "destaque";
          virtualHighlightEnabled = false;
        } else {
          currentTab = "planejamento";
          virtualHighlightEnabled = false;
          if (virtualCutoutImgEl) {
            virtualCutoutImgEl.style.display = "none";
          }
        }
      }
    } else {
      currentTab = tabName;
      virtualHighlightEnabled = true;
    }

    const isDestaque = currentTab === "destaque";
    const destaqueVisualActive = isVirtualMode
      ? isDestaque && virtualHighlightEnabled
      : isDestaque;

    if (tabDestaque) {
      tabDestaque.classList.toggle("is-active", destaqueVisualActive);
      tabDestaque.setAttribute("aria-selected", String(destaqueVisualActive));
    }
    if (tabPlanejamento) {
      tabPlanejamento.classList.toggle("is-active", !isDestaque);
      tabPlanejamento.setAttribute("aria-selected", String(!isDestaque));
    }

    renderTabContent();
  }

  function applyGroupTheme(person, targetIdx = null) {
    if (lostDebounceTimer) {
      clearTimeout(lostDebounceTimer);
      lostDebounceTimer = null;
    }

    const isSamePerson =
      currentPerson && currentPerson.targetIndex === person.targetIndex;
    currentPerson = person;
    activeTargetIndex = targetIdx;

    const palette = getPaletteForPerson(person);
    const root = document.documentElement;

    root.style.setProperty("--group-dot", palette.dot);
    root.style.setProperty("--card-bg", palette.cardBg);
    root.style.setProperty("--card-title", palette.titleColor);
    root.style.setProperty("--card-dates", palette.datesColor);
    root.style.setProperty("--card-text", palette.textColor);
    root.style.setProperty(
      "--tab-selected-text",
      palette.tabSelectedText || "#ec1c7a",
    );

    if (groupBannerText) {
      groupBannerText.textContent = palette.nomeGrupo;
    }

    if (!isSamePerson) {
      currentTab = "destaque";
      if (isVirtualMode) {
        virtualHighlightEnabled = false;
        if (tabDestaque) {
          tabDestaque.classList.remove("is-active");
          tabDestaque.setAttribute("aria-selected", "false");
        }
        if (tabPlanejamento) {
          tabPlanejamento.classList.remove("is-active");
          tabPlanejamento.setAttribute("aria-selected", "false");
        }
        renderTabContent();
      } else {
        setActiveTab("destaque");
      }
    } else {
      renderTabContent();
    }

    if (reticle) {
      reticle.classList.add("locked");
      reticle.style.display = "none";
    }
    if (personalityHud) {
      personalityHud.classList.add("visible");
      personalityHud.style.opacity = "1";
      personalityHud.style.transform = "translateY(0)";
    }
  }

  function resetScannerTheme(lostTargetIdx = null) {
    if (isVirtualMode) return;
    if (
      lostTargetIdx !== null &&
      activeTargetIndex !== null &&
      lostTargetIdx !== activeTargetIndex
    ) {
      return;
    }

    if (lostDebounceTimer) {
      clearTimeout(lostDebounceTimer);
    }

    lostDebounceTimer = setTimeout(() => {
      let stillVisiblePerson = null;
      let stillVisibleIndex = null;

      targetElementsMap.forEach((el, idx) => {
        if (el.object3D && el.object3D.visible) {
          const found = (window.PERSONALIDADES_DB || []).find(
            (p) => p.targetIndex === idx,
          );
          if (found) {
            stillVisiblePerson = found;
            stillVisibleIndex = idx;
          }
        }
      });

      if (stillVisiblePerson) {
        applyGroupTheme(stillVisiblePerson, stillVisibleIndex);
        return;
      }

      currentPerson = null;
      activeTargetIndex = null;
      if (groupBannerText) {
        groupBannerText.textContent = "APONTE PARA O CARTAZ";
      }
      if (reticle) {
        reticle.classList.remove("locked");
        reticle.style.display = "";
      }
      if (personalityHud) {
        personalityHud.classList.remove("visible");
        personalityHud.style.opacity = "";
        personalityHud.style.transform = "";
      }
    }, 220);
  }

  if (tabDestaque) {
    tabDestaque.addEventListener("click", () => setActiveTab("destaque"));
  }
  if (tabPlanejamento) {
    tabPlanejamento.addEventListener("click", () =>
      setActiveTab("planejamento"),
    );
  }

  if (sceneEl) {
    sceneEl.addEventListener("renderstart", () => {
      if (sceneEl.renderer) {
        sceneEl.renderer.setClearColor(0x000000, 0);
        sceneEl.renderer.setClearAlpha(0);
      }
    });
  }

  function buildCharacterPopOutLayer(person, options = {}) {
    const isVirtual = Boolean(options.isVirtual);
    const palette = getPaletteForPerson(person);
    const container = document.createElement("a-entity");
    const cfg = person.destaquePopOut || {
      ativo: true,
      profundidadeZ: 0.08,
      escalaExtra: 1.04,
      posX: 0,
      posY: 0.08,
    };

    if (!cfg.ativo) return container;

    const zDepth = cfg.profundidadeZ || 0.08;
    const cutoutUrl = isVirtual
      ? cfg.arquivoVirtual ||
        cfg.arquivoPNG ||
        cfg.arquivoWebP ||
        cfg.arquivoWEBP ||
        ""
      : cfg.arquivoPNG || cfg.arquivoWebP || cfg.arquivoWEBP || "";

    container.setAttribute(
      "animation__float",
      "property: position; dir: alternate; dur: 2800; easing: easeInOutSine; loop: true; from: 0 0 0; to: 0 0 0.025",
    );

    const holder = document.createElement("a-entity");
    container.appendChild(holder);

    holder.addEventListener("loaded", () => {
      loadTextureCached(
        cutoutUrl,
        (texture) => {
          const shadowMat = new THREE.MeshBasicMaterial({
            map: texture,
            color: 0x000000,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
          });
          const shadowMesh = new THREE.Mesh(sharedPlaneGeo, shadowMat);
          shadowMesh.position.set(cfg.posX + 0.015, -0.015, zDepth * 0.4);

          const charMat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.05,
          });
          const charMesh = new THREE.Mesh(sharedPlaneGeo, charMat);
          charMesh.position.set(cfg.posX, 0, zDepth);

          const group = new THREE.Group();
          group.add(shadowMesh, charMesh);
          holder.setObject3D("mesh", group);
        },
        () => {
          const haloCanvas = document.createElement("canvas");
          haloCanvas.width = 512;
          haloCanvas.height = 640;
          const hCtx = haloCanvas.getContext("2d");

          hCtx.clearRect(0, 0, 512, 640);
          hCtx.strokeStyle = palette.titleColor;
          hCtx.lineWidth = 5;
          hCtx.setLineDash([45, 25]);
          hCtx.strokeRect(20, 20, 472, 600);

          const haloTex = new THREE.CanvasTexture(haloCanvas);
          haloTex.colorSpace = THREE.SRGBColorSpace;
          const mat = new THREE.MeshBasicMaterial({
            map: haloTex,
            transparent: true,
            depthWrite: false,
          });
          const mesh = new THREE.Mesh(sharedPlaneGeo, mat);
          mesh.position.set(cfg.posX || 0, cfg.posY || 0.14, zDepth * 0.75);
          holder.setObject3D("mesh", mesh);
        },
      );
    });

    return container;
  }

  function buildPlanningDigitalLayer(person, options = {}) {
    const isVirtual = Boolean(options.isVirtual);
    const palette = getPaletteForPerson(person);
    const container = document.createElement("a-entity");
    container.setAttribute("visible", "false");

    const holder = document.createElement("a-entity");
    container.appendChild(holder);

    holder.addEventListener("loaded", () => {
      const planningSrc = isVirtual
        ? person.imagemMockupPlanejamento || person.arquivoPlanejamento || ""
        : person.arquivoPlanejamento || "";

      loadTextureCached(
        planningSrc,
        (texture) => {
          const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
          });
          const mesh = new THREE.Mesh(planningPlaneGeo, mat);
          mesh.position.set(0, 0, 0.04);
          holder.setObject3D("mesh", mesh);
        },
        () => {
          const canvas = document.createElement("canvas");
          canvas.width = 600;
          canvas.height = 848;
          const ctx = canvas.getContext("2d");

          ctx.fillStyle = "#111111";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = palette.cardBg;
          ctx.lineWidth = 10;
          ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

          ctx.fillStyle = palette.titleColor;
          ctx.font = "700 34px 'Queering', sans-serif";
          ctx.fillText("COMO FOI PLANEJADO", 44, 80);

          ctx.fillStyle = "#ffffff";
          ctx.font = "400 22px 'Inter', sans-serif";
          ctx.fillText("Coloque o arquivo do planejamento em:", 44, 130);
          ctx.fillText(planningSrc || "./assets/planejamento/", 44, 164);

          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
          });
          const mesh = new THREE.Mesh(planningPlaneGeo, mat);
          mesh.position.set(0, 0, 0.04);
          holder.setObject3D("mesh", mesh);
        },
      );
    });

    return container;
  }

  function createPerson3DContent(person, mapKey, options = {}) {
    const wrapper = document.createElement("a-entity");

    const destaqueLayer = buildCharacterPopOutLayer(person, options);
    const planejamentoLayer = buildPlanningDigitalLayer(person, options);

    wrapper.append(destaqueLayer, planejamentoLayer);
    targetLayersMap.set(mapKey, { destaqueLayer, planejamentoLayer });
    return wrapper;
  }

  function clearDemoPreview() {
    targetLayersMap.delete("demo-preview");
    if (demoPreviewContainer && demoPreviewContainer.parentNode) {
      demoPreviewContainer.parentNode.removeChild(demoPreviewContainer);
      demoPreviewContainer = null;
    }
  }

  window.simulateTarget = function (index) {
    const person = (window.PERSONALIDADES_DB || []).find(
      (p) => Number(p.targetIndex) === Number(index),
    );
    if (!person) return;

    isVirtualMode = true;
    virtualHighlightEnabled = false;
    clearDemoPreview();

    if (sceneEl) {
      demoPreviewContainer = document.createElement("a-entity");
      demoPreviewContainer.setAttribute("position", "0 0.05 -1.65");
      demoPreviewContainer.appendChild(
        createPerson3DContent(person, "demo-preview", { isVirtual: true }),
      );
      sceneEl.appendChild(demoPreviewContainer);
    }

    applyGroupTheme(person, index);
    syncVirtualStage();
  };

  function initARTargets() {
    const fragment = document.createDocumentFragment();

    (window.PERSONALIDADES_DB || []).forEach((person) => {
      const targetEl = document.createElement("a-entity");
      targetEl.setAttribute(
        "mindar-image-target",
        `targetIndex: ${person.targetIndex}`,
      );

      targetEl.appendChild(
        createPerson3DContent(person, `target-${person.targetIndex}`, {
          isVirtual: false,
        }),
      );
      targetElementsMap.set(person.targetIndex, targetEl);

      targetEl.addEventListener("targetFound", () => {
        if (isVirtualMode) return;
        clearDemoPreview();
        applyGroupTheme(person, person.targetIndex);
      });
      targetEl.addEventListener("targetLost", () => {
        resetScannerTheme(person.targetIndex);
      });

      fragment.appendChild(targetEl);
    });

    if (sceneEl) {
      sceneEl.appendChild(fragment);
    }

    setInterval(() => {
      if (isVirtualMode || demoPreviewContainer) return;

      let visiblePerson = null;
      let visibleIdx = null;

      targetElementsMap.forEach((el, idx) => {
        if (el.object3D && el.object3D.visible) {
          const found = (window.PERSONALIDADES_DB || []).find(
            (p) => p.targetIndex === idx,
          );
          if (found) {
            visiblePerson = found;
            visibleIdx = idx;
          }
        }
      });

      if (
        visiblePerson &&
        (!currentPerson ||
          currentPerson.targetIndex !== visibleIdx ||
          !personalityHud.classList.contains("visible"))
      ) {
        applyGroupTheme(visiblePerson, visibleIdx);
      }
    }, 300);

    const params = new URLSearchParams(window.location.search);
    const targetParam = params.get("target");
    if (targetParam !== null && targetParam !== "") {
      const parsedIndex = Number(targetParam);
      if (!Number.isNaN(parsedIndex)) {
        isVirtualMode = true;
        window.simulateTarget(parsedIndex);
      }
    }
  }

  initARTargets();

  async function startMindARWithBestCamera() {
    if (isVirtualMode || !sceneEl) return;
    const sys = sceneEl.systems && sceneEl.systems["mindar-image-system"];
    if (!sys) return;

    const bestVideo = await getBestRearCameraConstraints();
    sys.userMediaConfig = {
      ...(sys.userMediaConfig || {}),
      video: bestVideo,
      audio: false,
    };

    try {
      await sys.start();
    } catch (err) {
      console.warn(
        "Falha ao iniciar MindAR com câmera selecionada, tentando fallback:",
        err,
      );
      await ensureCameraFeedVisible();
    }
  }

  if (sceneEl) {
    if (sceneEl.hasLoaded) {
      startMindARWithBestCamera();
    } else {
      sceneEl.addEventListener("loaded", startMindARWithBestCamera, {
        once: true,
      });
    }
  }

  async function ensureCameraFeedVisible() {
    if (isVirtualMode) return;
    const existingVideo = document.querySelector("body > video");
    if (existingVideo && existingVideo.srcObject) return;

    try {
      const videoConstraints = await getBestRearCameraConstraints();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      let fallbackVideo = document.getElementById("fallback-camera-video");
      if (!fallbackVideo) {
        fallbackVideo = document.createElement("video");
        fallbackVideo.id = "fallback-camera-video";
        fallbackVideo.setAttribute("playsinline", "");
        fallbackVideo.setAttribute("autoplay", "");
        fallbackVideo.muted = true;
        document.body.prepend(fallbackVideo);
      }
      fallbackVideo.srcObject = stream;
      await fallbackVideo.play();
    } catch (err) {
      console.warn("Câmera fallback indisponível:", err);
    }
  }

  if (sceneEl) {
    sceneEl.addEventListener("arError", async () => {
      await ensureCameraFeedVisible();
    });
  }
}
