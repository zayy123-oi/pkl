document.addEventListener("DOMContentLoaded", () => {
    if (Api.getToken()) {
        location.href="dashboard_siswa.html";
        return;

    }
    const form=document.getElementById("loginForm");
    const error=document.getElementById("loginError");

    form.addEventListener("submit",async (event) =>{
        event.preventDefault();
        error.classList.add("hidden");

        const button=form.querySelector("button[type=submit]");
        button.disabled=true;
        button.textContent="memproses...";
        try{
            const data=await Api.login(
                document.getElementById("username").value.trim(),
                document.getElementById("password").value,
            );
            if(!data?.access_token) {
                throw new Error("response login tidak memiliki akses token");
            }
            Api.saveSession(
                data.access_token,
                data.user||{},
                document.getElementById("rememberMe").checked,
            );
            location.href="dashboard_siswa.html";

        } catch (err) {
            error.textContent=err.message;
            error.classList.remove("hidden");

        } finally {
            button.disabled=false;
            button.textContent="Masuk";

        }

    });
});