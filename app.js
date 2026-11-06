// CaluServers — interacciones (sin backend propio; las compras y tickets van al portal WHMCS)
var WHMCS = "https://client.caluservers.com";
document.addEventListener("DOMContentLoaded", function () {
  // Selector de ubicación VPS: muestra solo los planes de esa ubicación
  var locBtns = document.querySelectorAll(".loc-card");
  locBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      locBtns.forEach(function (b) { b.classList.remove("selected"); b.setAttribute("aria-pressed", "false"); });
      btn.classList.add("selected");
      btn.setAttribute("aria-pressed", "true");
      var id = btn.getAttribute("data-loc");
      document.querySelectorAll(".vps-group").forEach(function (g) {
        g.hidden = g.getAttribute("data-group") !== id;
      });
      var heading = document.querySelector(".vps-plans-heading");
      if (heading) heading.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  // Tabs del showcase VPS
  var tabs = document.querySelectorAll(".vps-tab");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      var n = tab.getAttribute("data-slide");
      document.querySelectorAll(".vps-slide").forEach(function (s) {
        s.classList.toggle("active", s.getAttribute("data-panel") === n);
      });
    });
  });
  // Buscador de dominios: verifica disponibilidad en el portal WHMCS
  var ds = document.getElementById("domain-search");
  if (ds) ds.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = document.getElementById("domain-name").value.trim();
    var res = document.getElementById("domain-result");
    if (res) res.textContent = "Comprobando " + name + " en el portal de cliente…";
    window.location.href = WHMCS + "/cart.php?a=add&domain=register&query=" + encodeURIComponent(name);
  });
  // Contacto y abuso: abren un ticket en WHMCS con los datos ya escritos
  function ticketForm(id, dept) {
    var f = document.getElementById(id);
    if (!f) return;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(f);
      var text = Array.from(data.entries()).map(function (kv) { return kv[0] + ": " + kv[1]; }).join("\n");
      var url = WHMCS + "/submitticket.php?dept=" + encodeURIComponent(dept || "") +
        "&message=" + encodeURIComponent(text);
      window.open(url, "_blank");
    });
  }
  ticketForm("contact-form", "");
  ticketForm("abuse-form", "");
});
