(() => {
  "use strict";

  const chapterTitles = [
    "The beginning",
    "A note from us",
    "Two paths, one story",
    "The little adventures",
    "The promise",
    "Where & when",
    "Seal your reply",
    "Until the next chapter",
  ];

  const chapterCount = chapterTitles.length;
  const root = document.documentElement;
  const atmosphere = document.querySelector(".atmosphere");
  const vantaBackground = document.querySelector("#vantaBackground");
  const book = document.querySelector("#book");
  const spreads = [...document.querySelectorAll(".spread")];
  const turningUnderlay = document.querySelector("#turningUnderlay");
  const turningPage = document.querySelector("#turningPage");
  const turningFront = turningPage.querySelector(".turning-front");
  const turningBack = turningPage.querySelector(".turning-back");
  const chapterNumber = document.querySelector("#chapterNumber");
  const chapterTitle = document.querySelector("#chapterTitle");
  const pageAnnouncement = document.querySelector("#pageAnnouncement");
  const scrollPrompt = document.querySelector("#scrollPrompt");
  const prevButton = document.querySelector("#prevChapter");
  const nextButton = document.querySelector("#nextChapter");
  const chapterButtons = [...document.querySelectorAll("[data-chapter]")];
  const motionToggle = document.querySelector("#motionToggle");
  const soundToggle = document.querySelector("#soundToggle");
  const closeBookButton = document.querySelector("#closeBook");
  const mediaReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const singlePageLayout = window.matchMedia("(max-width: 760px)");
  const gsap = window.gsap;

  let currentChapter = -1;
  let activeSpreadIndex = -1;
  let ticking = false;
  let reducedMotion = mediaReduced.matches;
  let audioContext = null;
  let ambientNodes = [];
  let turningContentKey = "";
  let lenis = null;
  let lenisTicker = null;
  let lenisRafId = 0;
  let vantaEffect = null;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function getScrollRange() {
    return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  function getRawChapter() {
    return clamp((window.scrollY / getScrollRange()) * (chapterCount - 1), 0, chapterCount - 1);
  }

  function setActiveSpread(index) {
    if (index === activeSpreadIndex) return;
    activeSpreadIndex = index;

    spreads.forEach((spread, spreadIndex) => {
      const isActive = spreadIndex === index;
      spread.classList.toggle("is-active", isActive);
      spread.setAttribute("aria-hidden", String(!isActive));
      spread.querySelectorAll("a, button, input, textarea, [tabindex]").forEach((element) => {
        if (isActive) {
          const savedTabIndex = element.dataset.savedTabindex;
          if (savedTabIndex === "none") element.removeAttribute("tabindex");
          else if (savedTabIndex !== undefined) element.setAttribute("tabindex", savedTabIndex);
        } else {
          if (element.dataset.savedTabindex === undefined) {
            element.dataset.savedTabindex = element.hasAttribute("tabindex") ? element.getAttribute("tabindex") : "none";
          }
          element.setAttribute("tabindex", "-1");
        }
      });
    });

    if (!gsap || reducedMotion) return;
    const activeSpread = spreads[index];
    gsap.killTweensOf(activeSpread);
    gsap.fromTo(
      activeSpread,
      { opacity: 0 },
      { opacity: 1, duration: 0.32, ease: "power2.out", overwrite: true, clearProps: "opacity" }
    );
  }

  function createTurningCopy(page, copyClass = "turning-content") {
    const copy = page.cloneNode(true);
    const sourceFields = [...page.querySelectorAll("input, textarea, select")];
    const copyFields = [...copy.querySelectorAll("input, textarea, select")];

    copy.classList.add(copyClass);
    copy.setAttribute("aria-hidden", "true");
    copy.inert = true;

    copy.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    copy.querySelectorAll("[for]").forEach((element) => element.removeAttribute("for"));
    copy.querySelectorAll("[aria-controls], [aria-describedby], [aria-labelledby]").forEach((element) => {
      element.removeAttribute("aria-controls");
      element.removeAttribute("aria-describedby");
      element.removeAttribute("aria-labelledby");
    });
    copy.querySelectorAll("a, button, input, textarea, select, [tabindex]").forEach((element) => {
      element.setAttribute("tabindex", "-1");
      if ("disabled" in element) element.disabled = true;
    });

    sourceFields.forEach((source, index) => {
      const target = copyFields[index];
      if (!target) return;
      target.value = source.value;
      if ("checked" in source) target.checked = source.checked;
    });

    return copy;
  }

  function populateTurningPage(fromSpreadIndex, toSpreadIndex) {
    const layout = singlePageLayout.matches ? "single" : "spread";
    const contentKey = `${fromSpreadIndex}-${toSpreadIndex}-${layout}`;
    if (contentKey === turningContentKey) return;

    const outgoingPage = spreads[fromSpreadIndex].querySelector(".right-page");
    const incomingSelector = singlePageLayout.matches ? ".right-page" : ".left-page";
    const incomingPage = spreads[toSpreadIndex].querySelector(incomingSelector);
    const incomingRightPage = spreads[toSpreadIndex].querySelector(".right-page");
    const outgoingLeftPage = spreads[fromSpreadIndex].querySelector(".left-page");
    if (!outgoingPage || !incomingPage || !incomingRightPage || !outgoingLeftPage) return;

    turningFront.replaceChildren(createTurningCopy(outgoingPage));
    turningBack.replaceChildren(createTurningCopy(incomingPage));
    turningUnderlay.replaceChildren(
      ...(singlePageLayout.matches
        ? [createTurningCopy(incomingRightPage, "turning-underlay-page")]
        : [
            createTurningCopy(outgoingLeftPage, "turning-underlay-page"),
            createTurningCopy(incomingRightPage, "turning-underlay-page"),
          ])
    );
    turningUnderlay.classList.toggle("is-single", singlePageLayout.matches);
    turningContentKey = contentKey;
  }

  function animateChapterCaption() {
    if (!gsap || reducedMotion) return;
    const targets = [chapterNumber, chapterTitle];
    gsap.killTweensOf(targets);
    gsap.fromTo(
      targets,
      { autoAlpha: 0, y: 10 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.36,
        ease: "power2.out",
        stagger: 0.035,
        overwrite: true,
        clearProps: "transform,opacity,visibility",
      }
    );
  }

  function updateChapterUi(chapter) {
    if (chapter === currentChapter) return;
    currentChapter = chapter;

    chapterNumber.textContent = String(chapter).padStart(2, "0");
    chapterTitle.textContent = chapterTitles[chapter];
    pageAnnouncement.textContent = `Chapter ${chapter}: ${chapterTitles[chapter]}`;
    prevButton.disabled = chapter === 0;
    nextButton.disabled = chapter === chapterCount - 1;

    chapterButtons.forEach((button) => {
      const isActive = Number(button.dataset.chapter) === chapter;
      button.classList.toggle("is-active", isActive);
      if (isActive) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });

    history.replaceState(null, "", `#chapter-${chapter}`);
    animateChapterCaption();
  }

  function renderFromScroll() {
    const raw = getRawChapter();
    const chapter = Math.round(raw);
    const baseChapter = Math.floor(raw);
    const localProgress = raw - baseChapter;
    const overallProgress = raw / (chapterCount - 1);
    const isOpen = raw > 0.14;

    root.style.setProperty("--chapter-progress", overallProgress.toFixed(4));
    book.classList.toggle("is-closed", !isOpen);
    book.classList.toggle("is-open", isOpen);
    book.classList.remove("is-closing");
    scrollPrompt.style.opacity = raw > 0.2 ? "0" : "1";

    let spreadIndex = 0;
    if (baseChapter >= 1) {
      spreadIndex = clamp(baseChapter - 1 + (localProgress >= 0.5 ? 1 : 0), 0, spreads.length - 1);
    }
    setActiveSpread(spreadIndex);

    const isPageTurn = isOpen && baseChapter >= 1 && baseChapter < chapterCount - 1;
    const showTurningPage = isPageTurn && localProgress > 0.025 && localProgress < 0.985 && !reducedMotion;
    const pageCurl = showTurningPage ? Math.sin(localProgress * Math.PI) : 0;

    if (showTurningPage) {
      populateTurningPage(baseChapter - 1, baseChapter);
    } else {
      turningContentKey = "";
    }

    turningPage.classList.toggle("is-visible", showTurningPage);
    turningPage.classList.toggle("is-past-half", localProgress >= 0.5);
    turningUnderlay.classList.toggle("is-visible", showTurningPage);
    book.classList.toggle("is-turning", showTurningPage);
    root.style.setProperty("--page-angle", `${(-180 * localProgress).toFixed(2)}deg`);
    root.style.setProperty("--page-curl", pageCurl.toFixed(4));
    root.style.setProperty("--page-lift", `${(pageCurl * 18).toFixed(2)}px`);
    root.style.setProperty("--page-roll", `${(-pageCurl * 0.72).toFixed(2)}deg`);
    root.style.setProperty("--page-edge-lift", `${(pageCurl * 0.8).toFixed(2)}%`);

    updateChapterUi(chapter);
    ticking = false;
  }

  function requestRender() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(renderFromScroll);
  }

  function initLenis() {
    if (reducedMotion || lenis || !window.Lenis) return;

    lenis = new window.Lenis({
      autoRaf: false,
      duration: 1.1,
      easing: (time) => Math.min(1, 1.001 - Math.pow(2, -10 * time)),
      smoothWheel: true,
      syncTouch: false,
    });

    if (gsap) {
      lenisTicker = (time) => lenis?.raf(time * 1000);
      gsap.ticker.add(lenisTicker);
      gsap.ticker.lagSmoothing(0);
    } else {
      const renderLenis = (time) => {
        lenis?.raf(time);
        lenisRafId = window.requestAnimationFrame(renderLenis);
      };
      lenisRafId = window.requestAnimationFrame(renderLenis);
    }
  }

  function destroyLenis() {
    if (!lenis) return;
    if (gsap && lenisTicker) gsap.ticker.remove(lenisTicker);
    if (lenisRafId) window.cancelAnimationFrame(lenisRafId);
    lenis.destroy();
    lenis = null;
    lenisTicker = null;
    lenisRafId = 0;
  }

  function initVanta() {
    if (reducedMotion || vantaEffect || !vantaBackground || !window.VANTA?.CLOUDS) return;

    try {
      vantaEffect = window.VANTA.CLOUDS({
        el: "#vantaBackground",
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
      });
      atmosphere?.classList.add("is-vanta-ready");
    } catch {
      atmosphere?.classList.remove("is-vanta-ready");
    }
  }

  function destroyVanta() {
    vantaEffect?.destroy();
    vantaEffect = null;
    atmosphere?.classList.remove("is-vanta-ready");
    vantaBackground?.replaceChildren();
  }

  function playEntranceAnimation() {
    if (!gsap || reducedMotion) return;
    const targets = [
      ...document.querySelectorAll(".topbar > *, .chapter-rail, .story-caption, .stage-controls"),
      document.querySelector(".book-wrap"),
    ].filter(Boolean);
    gsap.from(targets, {
      autoAlpha: 0,
      y: 16,
      duration: 0.7,
      ease: "power3.out",
      stagger: 0.07,
      clearProps: "transform,opacity,visibility",
    });
  }

  function chapterScrollTop(index) {
    return (getScrollRange() / (chapterCount - 1)) * clamp(index, 0, chapterCount - 1);
  }

  function goToChapter(index, behavior = reducedMotion ? "auto" : "smooth") {
    const top = chapterScrollTop(index);
    if (lenis) {
      lenis.scrollTo(top, {
        duration: behavior === "auto" ? 0 : 1.1,
        immediate: behavior === "auto",
      });
      return;
    }
    window.scrollTo({ top, behavior });
  }

  window.addEventListener("scroll", () => {
    requestRender();
  }, { passive: true });

  window.addEventListener("resize", () => {
    vantaEffect?.resize?.();
    requestRender();
  }, { passive: true });
  singlePageLayout.addEventListener("change", () => {
    turningContentKey = "";
    requestRender();
  });

  window.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea, select, button")) return;
    if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      goToChapter(Math.min(chapterCount - 1, Math.round(getRawChapter()) + 1));
    }
    if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
      event.preventDefault();
      goToChapter(Math.max(0, Math.round(getRawChapter()) - 1));
    }
    if (event.key === "Home") {
      event.preventDefault();
      goToChapter(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      goToChapter(chapterCount - 1);
    }
  });

  prevButton.addEventListener("click", () => goToChapter(Math.round(getRawChapter()) - 1));
  nextButton.addEventListener("click", () => goToChapter(Math.round(getRawChapter()) + 1));
  closeBookButton.addEventListener("click", () => {
    book.classList.add("is-closing");
    goToChapter(0);
  });

  chapterButtons.forEach((button) => {
    button.addEventListener("click", () => goToChapter(Number(button.dataset.chapter)));
  });

  document.querySelectorAll("[data-chapter-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      goToChapter(Number(link.dataset.chapterLink));
    });
  });

  function setMotionPreference(shouldReduce, persist = true) {
    reducedMotion = shouldReduce;
    document.body.classList.toggle("reduced-motion", shouldReduce);
    motionToggle.setAttribute("aria-pressed", String(shouldReduce));
    motionToggle.querySelector("span").textContent = shouldReduce ? "More motion" : "Less motion";
    if (persist) localStorage.setItem("adventure-reduced-motion", String(shouldReduce));
    if (shouldReduce) {
      destroyLenis();
      destroyVanta();
    } else {
      initLenis();
      initVanta();
    }
    requestRender();
  }

  const storedMotionPreference = localStorage.getItem("adventure-reduced-motion");
  setMotionPreference(
    storedMotionPreference === null ? mediaReduced.matches : storedMotionPreference === "true",
    storedMotionPreference !== null
  );
  motionToggle.addEventListener("click", () => setMotionPreference(!reducedMotion));
  mediaReduced.addEventListener("change", (event) => {
    if (localStorage.getItem("adventure-reduced-motion") === null) setMotionPreference(event.matches, false);
  });

  function stopAmbient() {
    if (!audioContext) return;
    ambientNodes.forEach((node) => {
      try { node.stop(); } catch { /* already stopped */ }
      node.disconnect();
    });
    ambientNodes = [];
    audioContext.close();
    audioContext = null;
    soundToggle.setAttribute("aria-pressed", "false");
    soundToggle.setAttribute("aria-label", "Play ambient sound");
  }

  function startAmbient() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext = new AudioContextClass();
    const master = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    master.gain.setValueAtTime(0.0001, audioContext.currentTime);
    master.gain.exponentialRampToValueAtTime(0.025, audioContext.currentTime + 1.8);
    filter.type = "lowpass";
    filter.frequency.value = 720;
    filter.Q.value = 0.6;
    filter.connect(master);
    master.connect(audioContext.destination);

    [146.83, 220, 293.66].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const tremolo = audioContext.createOscillator();
      const tremoloGain = audioContext.createGain();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 0 ? -5 : index === 2 ? 6 : 0;
      gain.gain.value = index === 1 ? 0.42 : 0.25;
      tremolo.frequency.value = 0.06 + index * 0.025;
      tremoloGain.gain.value = 0.035;
      tremolo.connect(tremoloGain);
      tremoloGain.connect(gain.gain);
      oscillator.connect(gain);
      gain.connect(filter);
      oscillator.start();
      tremolo.start();
      ambientNodes.push(oscillator, tremolo);
    });

    soundToggle.setAttribute("aria-pressed", "true");
    soundToggle.setAttribute("aria-label", "Pause ambient sound");
  }

  soundToggle.addEventListener("click", () => {
    if (audioContext) stopAmbient();
    else startAmbient();
  });

  const draggable = document.querySelector(".draggable");
  if (draggable) {
    let dragState = null;

    draggable.addEventListener("pointerdown", (event) => {
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: Number(draggable.dataset.x || 0),
        originY: Number(draggable.dataset.y || 0),
      };
      draggable.setPointerCapture(event.pointerId);
      draggable.classList.add("is-dragging");
    });

    draggable.addEventListener("pointermove", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const parent = draggable.offsetParent.getBoundingClientRect();
      const bounds = draggable.getBoundingClientRect();
      const nextX = clamp(dragState.originX + event.clientX - dragState.startX, -bounds.left + parent.left, parent.right - bounds.right);
      const nextY = clamp(dragState.originY + event.clientY - dragState.startY, -bounds.top + parent.top, parent.bottom - bounds.bottom);
      draggable.dataset.x = String(nextX);
      draggable.dataset.y = String(nextY);
      draggable.style.transform = `translate3d(${nextX}px, ${nextY}px, 0) rotate(8deg)`;
    });

    const finishDrag = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      draggable.classList.remove("is-dragging");
      draggable.releasePointerCapture(event.pointerId);
      dragState = null;
    };
    draggable.addEventListener("pointerup", finishDrag);
    draggable.addEventListener("pointercancel", finishDrag);
  }

  const rsvpForm = document.querySelector("#rsvpForm");
  const rsvpEnvelope = document.querySelector("#rsvpEnvelope");
  const nameInput = document.querySelector("#guestName");
  const nameError = document.querySelector("#nameError");
  const formError = document.querySelector("#formError");
  const editRsvp = document.querySelector("#editRsvp");

  document.querySelectorAll(".radio-card").forEach((card) => {
    card.addEventListener("click", () => {
      const choice = card.querySelector("input[type='radio']");
      window.setTimeout(() => {
        choice.checked = true;
        choice.dispatchEvent(new Event("change", { bubbles: true }));
        formError.textContent = "";
      }, 0);
    });
  });

  function clearNameError() {
    nameError.textContent = "";
    nameInput.removeAttribute("aria-invalid");
  }

  nameInput.addEventListener("blur", () => {
    if (nameInput.value.trim()) clearNameError();
    else {
      nameError.textContent = "Please add your name so we know who replied.";
      nameInput.setAttribute("aria-invalid", "true");
    }
  });

  nameInput.addEventListener("input", clearNameError);

  rsvpForm.addEventListener("submit", (event) => {
    event.preventDefault();
    formError.textContent = "";
    const formData = new FormData(rsvpForm);
    let firstInvalid = null;

    if (!String(formData.get("name") || "").trim()) {
      nameError.textContent = "Please add your name so we know who replied.";
      nameInput.setAttribute("aria-invalid", "true");
      firstInvalid = nameInput;
    }

    if (!formData.get("attendance")) {
      formError.textContent = "Choose whether you can join us, then seal your reply.";
      firstInvalid ||= rsvpForm.querySelector("input[name='attendance']");
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const reply = {
      name: String(formData.get("name")),
      attendance: String(formData.get("attendance")),
      note: String(formData.get("note") || ""),
    };
    localStorage.setItem("adventure-rsvp", JSON.stringify(reply));
    rsvpEnvelope.classList.add("is-sealed");
  });

  editRsvp.addEventListener("click", () => {
    rsvpEnvelope.classList.remove("is-sealed");
    window.setTimeout(() => nameInput.focus(), reducedMotion ? 0 : 400);
  });

  function restoreReply() {
    try {
      const reply = JSON.parse(localStorage.getItem("adventure-rsvp"));
      if (!reply) return;
      nameInput.value = reply.name || "";
      const attendance = rsvpForm.querySelector(`input[name="attendance"][value="${reply.attendance}"]`);
      if (attendance) attendance.checked = true;
      document.querySelector("#guestNote").value = reply.note || "";
    } catch {
      localStorage.removeItem("adventure-rsvp");
    }
  }

  function updateCountdown() {
    const target = new Date("2027-09-12T16:00:00+05:30").getTime();
    const difference = Math.max(0, target - Date.now());
    const day = 1000 * 60 * 60 * 24;
    const hour = 1000 * 60 * 60;
    document.querySelector("#days").textContent = String(Math.floor(difference / day)).padStart(3, "0");
    document.querySelector("#hours").textContent = String(Math.floor((difference % day) / hour)).padStart(2, "0");
    document.querySelector("#minutes").textContent = String(Math.floor((difference % hour) / 60000)).padStart(2, "0");
  }

  function syncToHash() {
    const match = window.location.hash.match(/^#chapter-(\d)$/);
    if (!match) return;
    const chapter = clamp(Number(match[1]), 0, chapterCount - 1);
    goToChapter(chapter, "auto");
  }

  restoreReply();
  updateCountdown();
  window.setInterval(updateCountdown, 60_000);
  window.addEventListener("load", () => {
    syncToHash();
    renderFromScroll();
    playEntranceAnimation();
  });
  renderFromScroll();
})();
