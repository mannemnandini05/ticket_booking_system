import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api",
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("smartevent_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error.response?.data?.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => {
          const field = item.loc?.at(-1);
          const reason = String(item.msg || "Invalid value").replace(/^Value error, /, "");
          return `${field ? `${field}: ` : ""}${reason}`;
        }).join("; ")
      : typeof detail === "string"
        ? detail
          : !error.response && error.code === "ERR_NETWORK"
            ? `Unable to reach the API at ${error.config?.baseURL || "the configured server"}. Make sure the backend is running and try again.`
            : error.message || "Something went wrong";
    if (error.response?.status === 401 && localStorage.getItem("smartevent_token")) {
        window.dispatchEvent(new Event("smartevent:unauthorized"));
    }
    return Promise.reject(new Error(message));
  },
);

export default api;
